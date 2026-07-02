from __future__ import annotations

import argparse
import asyncio
import copy
import hmac
import http
import json
import logging
import math
import os
import re
import signal
import sqlite3
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed


LOG = logging.getLogger("tlt.sync_relay")

PROTOCOL_SCHEMA = 1
STATE_SCHEMA = 1
STATE_TYPE = "ootmm-session"
# Incoming frame cap. A join may carry a full-state seed snapshot, so this has
# to comfortably exceed MAX_SNAPSHOT_BYTES plus envelope overhead.
MAX_MESSAGE_BYTES = 768 * 1024
# Hard cap on the stored room document. The server never lets a room grow past
# this, so a rebroadcast snapshot always fits inside a client's receive cap and
# a room can never become un-joinable.
MAX_SNAPSHOT_BYTES = 512 * 1024
# Hard ceiling on total SQLite storage. Once the database reaches this size the
# relay refuses to create *new* rooms (existing rooms keep working). This bounds
# disk use against someone spraying joins at fresh room ids.
MAX_DB_BYTES = 1024 * 1024 * 1024  # 1 GiB
# Global rate limit on new-room creation: at most MAX_NEW_ROOMS_PER_MINUTE rooms
# may be created per rolling window. Joins to existing rooms are never limited.
ROOM_CREATION_WINDOW_MS = 60 * 1000
MAX_NEW_ROOMS_PER_MINUTE = 60
# Cap on simultaneous clients in a single room. Coop sessions are small; this
# bounds the broadcast fan-out (one op -> N sends) and per-room memory against
# someone who has a room code and opens many connections to it.
MAX_CLIENTS_PER_ROOM = 16
# A connection must send its join frame within this many seconds of opening or
# the relay drops it, so an anonymous socket can't be held open for free.
JOIN_TIMEOUT_SEC = 10
# Two-tier resident-memory ceilings, both opt-in, Linux-only, and disabled at 0
# (the default). RSS is sampled from /proc; a bad value would throttle real
# clients, so they stay off unless configured. Together they let the relay shed
# load gracefully before a cgroup MemoryMax OOM-kills it:
#
#   * DEFAULT_SOFT_MAX_RSS_BYTES -- the gentle tier. Once RSS reaches it,
#     materializing a not-yet-resident room (a brand-new room or one reloaded
#     from SQLite) is refused in _get_or_create_room_locked. A room's snapshot is
#     the dominant per-unit RSS cost, so this stops the relay taking on new
#     groups while groups already in memory keep playing.
#   * DEFAULT_MAX_RSS_BYTES -- the hard backstop. Once RSS reaches it,
#     process_request returns 503 for every new socket, before anything is
#     allocated (including sockets that only wanted to rejoin a resident room).
#
# Set soft below hard: the hard gate refuses sockets before they can send a join
# frame, so a soft ceiling at or above the hard one never fires. Empty-room
# eviction and idle pruning pull RSS back down, but CPython/glibc may not return
# freed memory to the OS, so a gate can stay tripped after a spike until the
# process is recycled.
DEFAULT_SOFT_MAX_RSS_BYTES = 0
DEFAULT_MAX_RSS_BYTES = 0
MAX_ID_LENGTH = 256
# Shortest room code the relay will accept. The browser generates 8-char codes;
# rejecting anything shorter keeps a trivially brute-forceable room off the wire.
ROOM_CODE_MIN_LENGTH = 8
ROOM_CODE_PATTERN = re.compile(r"^[A-Za-z0-9]+$")
MAX_JSON_DEPTH = 16
# Generous enough for a fully-completed game's seed snapshot (inventory +
# every collected location + settings in one message) while staying bounded.
MAX_JSON_ITEMS = 20000
MAX_JSON_STRING_LENGTH = 4096
IDLE_PRUNE_INTERVAL_SEC = 6 * 60 * 60
OUTBOX_MAX_MESSAGES = 32
SLOW_PEER_CLOSE_CODE = 1011
SLOW_PEER_CLOSE_REASON = "slow consumer"
UNSAFE_KEYS = {"__proto__", "prototype", "constructor"}

OP_TYPES = {
    "inventory.set_full",
    "inventory.set_count",
    "locations.set_collected",
    "locations.set_ids",
    "locations.set_junk_ids",
    "world.set_precompleted",
    "world.set_song_events",
    "world.set_shop_prices",
    "world.set_shop_price",
    "world.set_entrance_override",
    "world.set_entrance_overrides",
    "settings.apply",
    "settings.patch_special_conds",
    "session.set_spoiler_log_state",
}


class ProtocolError(ValueError):
    pass


@dataclass
class RoomState:
    room_id: str
    room_key: str
    latest_seq: int
    snapshot_envelope: dict[str, Any]
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    clients: dict[Any, "ClientConnection"] = field(default_factory=dict)


@dataclass
class ClientConnection:
    actor_id: str
    outbox: asyncio.Queue = field(
        default_factory=lambda: asyncio.Queue(maxsize=OUTBOX_MAX_MESSAGES)
    )
    sender_task: asyncio.Task | None = None


def now_ms() -> int:
    return int(time.time() * 1000)


_PAGE_SIZE = os.sysconf("SC_PAGE_SIZE") if hasattr(os, "sysconf") else 4096


def current_rss_bytes() -> int:
    """Current resident set size in bytes via Linux /proc; 0 if unavailable.

    Returning 0 on non-Linux platforms means the RSS gate is a no-op there
    rather than erroring, which is fine: it is documented as Linux-only.
    """
    try:
        with open("/proc/self/statm", "r", encoding="ascii") as handle:
            resident_pages = int(handle.read().split()[1])
    except (OSError, ValueError, IndexError):
        return 0
    return resident_pages * _PAGE_SIZE


def is_object(value: Any) -> bool:
    return isinstance(value, dict)


def is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def is_safe_key(key: str) -> bool:
    return key not in UNSAFE_KEYS


def parse_json_message(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProtocolError("invalid json") from exc
    if not is_object(value):
        raise ProtocolError("json payload must be an object")
    validate_json_tree(value)
    return value


def validate_json_tree(value: Any, *, depth: int = 0, seen_items: list[int] | None = None) -> None:
    if seen_items is None:
        seen_items = [0]
    seen_items[0] += 1
    if seen_items[0] > MAX_JSON_ITEMS:
        raise ProtocolError("payload too large")
    if depth > MAX_JSON_DEPTH:
        raise ProtocolError("payload too deep")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ProtocolError("non-finite number")
        return
    if isinstance(value, str):
        if len(value) > MAX_JSON_STRING_LENGTH:
            raise ProtocolError("string too long")
        return
    if isinstance(value, list):
        for entry in value:
            validate_json_tree(entry, depth=depth + 1, seen_items=seen_items)
        return
    if isinstance(value, dict):
        for key, entry in value.items():
            if not isinstance(key, str):
                raise ProtocolError("object keys must be strings")
            if len(key) > MAX_JSON_STRING_LENGTH:
                raise ProtocolError("object key too long")
            if not is_safe_key(key):
                raise ProtocolError("unsafe key")
            validate_json_tree(entry, depth=depth + 1, seen_items=seen_items)
        return
    raise ProtocolError("unsupported json value")


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value.keys())
    if actual != expected:
        raise ProtocolError(f"{label} has unexpected keys")


def require_string(value: Any, label: str, *, min_len: int = 1, max_len: int = MAX_ID_LENGTH) -> str:
    if not isinstance(value, str):
        raise ProtocolError(f"{label} must be a string")
    if len(value) < min_len:
        raise ProtocolError(f"{label} is too short")
    if len(value) > max_len:
        raise ProtocolError(f"{label} is too long")
    if not is_safe_key(value):
        raise ProtocolError(f"{label} uses an unsafe value")
    return value


def require_room_code(value: Any, label: str) -> str:
    normalized = require_string(value, label, min_len=ROOM_CODE_MIN_LENGTH)
    if ROOM_CODE_PATTERN.fullmatch(normalized) is None:
        raise ProtocolError(f"{label} must be alphanumeric")
    return normalized


def require_nonnegative_int(value: Any, label: str) -> int:
    if not is_finite_number(value):
        raise ProtocolError(f"{label} must be a number")
    if int(value) != value or value < 0:
        raise ProtocolError(f"{label} must be a non-negative integer")
    return int(value)


def normalize_id_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ProtocolError(f"{label} must be an array")
    unique = {
        require_string(entry, f"{label}[]")
        for entry in value
    }
    return sorted(unique)


def normalize_nonnegative_int_map(value: Any, label: str, *, drop_zero: bool = False) -> dict[str, int]:
    if not is_object(value):
        raise ProtocolError(f"{label} must be an object")
    items: list[tuple[str, int]] = []
    for key, entry in value.items():
        safe_key = require_string(key, f"{label}.key")
        numeric = require_nonnegative_int(entry, f"{label}.{safe_key}")
        if drop_zero and numeric == 0:
            continue
        items.append((safe_key, numeric))
    items.sort(key=lambda item: item[0])
    return dict(items)


def normalize_string_map(value: Any, label: str) -> dict[str, str]:
    if not is_object(value):
        raise ProtocolError(f"{label} must be an object")
    items: list[tuple[str, str]] = []
    for key, entry in value.items():
        safe_key = require_string(key, f"{label}.key")
        safe_value = require_string(entry, f"{label}.{safe_key}")
        items.append((safe_key, safe_value))
    items.sort(key=lambda item: item[0])
    return dict(items)


def canonicalize_json(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [canonicalize_json(entry) for entry in value]
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda item: item[0])
        return {
            key: canonicalize_json(entry)
            for key, entry in items
        }
    raise ProtocolError("unsupported json value")


def merge_json_object(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for key in sorted(set(base.keys()) | set(patch.keys())):
        if key not in patch:
            merged[key] = canonicalize_json(base[key])
            continue
        patch_value = patch[key]
        base_value = base.get(key)
        if isinstance(base_value, dict) and isinstance(patch_value, dict):
            merged[key] = merge_json_object(base_value, patch_value)
        else:
            merged[key] = canonicalize_json(patch_value)
    return merged


def default_room_document() -> dict[str, Any]:
    return {
        "inventoryById": {},
        "collectedLocationIds": [],
        "junkLocationIds": [],
        "preCompletedDungeons": [],
        "songEvents": {},
        "shopPrices": {},
        "trackerSettings": {},
        "entranceOverrides": {},
        "hasImportedSpoilerLog": False,
        "importedSpoilerLogVersion": None,
    }


def default_snapshot_envelope(room_id: str) -> dict[str, Any]:
    return {
        "protocolSchema": PROTOCOL_SCHEMA,
        "stateSchema": STATE_SCHEMA,
        "stateType": STATE_TYPE,
        "sessionId": room_id,
        "baselineSeq": 0,
        "capturedAt": now_ms(),
        "state": default_room_document(),
    }


def normalize_room_document(value: Any) -> dict[str, Any]:
    """Validate an untrusted room-state object into a normalized document.

    Unknown keys are ignored and missing keys fall back to defaults, so this is
    forward-compatible with clients that add state fields later.
    """
    if not is_object(value):
        raise ProtocolError("seed state must be an object")
    document = default_room_document()
    if "inventoryById" in value:
        document["inventoryById"] = normalize_nonnegative_int_map(
            value["inventoryById"], "seed.inventoryById", drop_zero=True
        )
    if "collectedLocationIds" in value:
        document["collectedLocationIds"] = normalize_id_list(
            value["collectedLocationIds"], "seed.collectedLocationIds"
        )
    if "junkLocationIds" in value:
        document["junkLocationIds"] = normalize_id_list(
            value["junkLocationIds"], "seed.junkLocationIds"
        )
    if "preCompletedDungeons" in value:
        document["preCompletedDungeons"] = normalize_id_list(
            value["preCompletedDungeons"], "seed.preCompletedDungeons"
        )
    if "songEvents" in value:
        document["songEvents"] = normalize_nonnegative_int_map(
            value["songEvents"], "seed.songEvents"
        )
    if "shopPrices" in value:
        document["shopPrices"] = normalize_nonnegative_int_map(
            value["shopPrices"], "seed.shopPrices"
        )
    if "trackerSettings" in value:
        settings = value["trackerSettings"]
        if not is_object(settings):
            raise ProtocolError("seed.trackerSettings must be an object")
        document["trackerSettings"] = canonicalize_json(settings)
    if "entranceOverrides" in value:
        document["entranceOverrides"] = normalize_string_map(
            value["entranceOverrides"], "seed.entranceOverrides"
        )
    if "hasImportedSpoilerLog" in value:
        if not isinstance(value["hasImportedSpoilerLog"], bool):
            raise ProtocolError("seed.hasImportedSpoilerLog must be a boolean")
        document["hasImportedSpoilerLog"] = value["hasImportedSpoilerLog"]
    if "importedSpoilerLogVersion" in value:
        version = value["importedSpoilerLogVersion"]
        document["importedSpoilerLogVersion"] = (
            None if version is None else require_string(version, "seed.importedSpoilerLogVersion")
        )
    if not document["hasImportedSpoilerLog"]:
        document["importedSpoilerLogVersion"] = None
    return document


def build_seed_snapshot_envelope(room_id: str, seed: Any) -> dict[str, Any]:
    """Build a fresh room snapshot from an untrusted client-supplied seed."""
    state = seed.get("state") if is_object(seed) else None
    document = normalize_room_document(state if state is not None else {})
    envelope = {
        "protocolSchema": PROTOCOL_SCHEMA,
        "stateSchema": STATE_SCHEMA,
        "stateType": STATE_TYPE,
        "sessionId": room_id,
        "baselineSeq": 0,
        "capturedAt": now_ms(),
        "state": document,
    }
    serialized = json.dumps(envelope, separators=(",", ":"), sort_keys=True)
    if len(serialized.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise ProtocolError("seed snapshot too large")
    return envelope


def normalize_join_message(message: dict[str, Any]) -> dict[str, Any]:
    required = {"type", "roomId", "roomKey", "actorId"}
    allowed = required | {"snapshotEnvelope"}
    keys = set(message.keys())
    if not required.issubset(keys) or not keys.issubset(allowed):
        raise ProtocolError("join has unexpected keys")
    if message["type"] != "join":
        raise ProtocolError("first message must be a join")
    seed_snapshot = message.get("snapshotEnvelope")
    if seed_snapshot is not None and not is_object(seed_snapshot):
        raise ProtocolError("snapshotEnvelope must be an object")
    return {
        "type": "join",
        "roomId": require_room_code(message["roomId"], "roomId"),
        "roomKey": require_room_code(message["roomKey"], "roomKey"),
        "actorId": require_string(message["actorId"], "actorId"),
        "seedSnapshot": seed_snapshot,
    }


def normalize_op_message(message: dict[str, Any], room_id: str) -> dict[str, Any]:
    require_exact_keys(message, {"type", "envelope"}, "client message")
    if message["type"] != "op":
        raise ProtocolError("unsupported message type")
    if not is_object(message["envelope"]):
        raise ProtocolError("envelope must be an object")
    envelope = normalize_operation_envelope(message["envelope"], room_id)
    return {"type": "op", "envelope": envelope}


def normalize_operation_envelope(envelope: dict[str, Any], room_id: str) -> dict[str, Any]:
    require_exact_keys(
        envelope,
        {"protocolSchema", "sessionId", "opId", "actorId", "clientClock", "ts", "op"},
        "envelope",
    )
    protocol_schema = require_nonnegative_int(envelope["protocolSchema"], "protocolSchema")
    if protocol_schema != PROTOCOL_SCHEMA:
        raise ProtocolError("unsupported protocol schema")
    session_id = require_string(envelope["sessionId"], "sessionId")
    if session_id != room_id:
        raise ProtocolError("sessionId must match roomId")
    if not is_object(envelope["op"]):
        raise ProtocolError("op must be an object")
    return {
        "protocolSchema": protocol_schema,
        "sessionId": session_id,
        "opId": require_string(envelope["opId"], "opId"),
        "actorId": require_string(envelope["actorId"], "actorId"),
        "clientClock": require_nonnegative_int(envelope["clientClock"], "clientClock"),
        "ts": require_nonnegative_int(envelope["ts"], "ts"),
        "op": normalize_operation(envelope["op"]),
    }


def normalize_operation(operation: dict[str, Any]) -> dict[str, Any]:
    op_type = require_string(operation.get("type"), "op.type")
    if op_type not in OP_TYPES:
        raise ProtocolError("unknown op type")

    if op_type == "inventory.set_full":
        require_exact_keys(operation, {"type", "inventoryById"}, op_type)
        return {
            "type": op_type,
            "inventoryById": normalize_nonnegative_int_map(
                operation["inventoryById"],
                "inventoryById",
                drop_zero=True,
            ),
        }
    if op_type == "inventory.set_count":
        require_exact_keys(operation, {"type", "itemId", "count"}, op_type)
        return {
            "type": op_type,
            "itemId": require_string(operation["itemId"], "itemId"),
            "count": require_nonnegative_int(operation["count"], "count"),
        }
    if op_type == "locations.set_collected":
        require_exact_keys(operation, {"type", "locationId", "collected"}, op_type)
        if not isinstance(operation["collected"], bool):
            raise ProtocolError("collected must be a boolean")
        return {
            "type": op_type,
            "locationId": require_string(operation["locationId"], "locationId"),
            "collected": operation["collected"],
        }
    if op_type == "locations.set_ids":
        require_exact_keys(operation, {"type", "ids"}, op_type)
        return {
            "type": op_type,
            "ids": normalize_id_list(operation["ids"], "ids"),
        }
    if op_type == "locations.set_junk_ids":
        require_exact_keys(operation, {"type", "ids"}, op_type)
        return {
            "type": op_type,
            "ids": normalize_id_list(operation["ids"], "ids"),
        }
    if op_type == "world.set_precompleted":
        require_exact_keys(operation, {"type", "ids"}, op_type)
        return {
            "type": op_type,
            "ids": normalize_id_list(operation["ids"], "ids"),
        }
    if op_type == "world.set_song_events":
        require_exact_keys(operation, {"type", "events"}, op_type)
        return {
            "type": op_type,
            "events": normalize_nonnegative_int_map(operation["events"], "events"),
        }
    if op_type == "world.set_shop_prices":
        require_exact_keys(operation, {"type", "prices"}, op_type)
        return {
            "type": op_type,
            "prices": normalize_nonnegative_int_map(operation["prices"], "prices"),
        }
    if op_type == "world.set_shop_price":
        require_exact_keys(operation, {"type", "locationId", "price"}, op_type)
        price = operation["price"]
        normalized_price = None if price is None else require_nonnegative_int(price, "price")
        return {
            "type": op_type,
            "locationId": require_string(operation["locationId"], "locationId"),
            "price": normalized_price,
        }
    if op_type == "world.set_entrance_override":
        require_exact_keys(operation, {"type", "src", "dst"}, op_type)
        dst = operation["dst"]
        normalized_dst = None if dst is None else require_string(dst, "dst")
        return {
            "type": op_type,
            "src": require_string(operation["src"], "src"),
            "dst": normalized_dst,
        }
    if op_type == "world.set_entrance_overrides":
        require_exact_keys(operation, {"type", "overrides"}, op_type)
        return {
            "type": op_type,
            "overrides": normalize_string_map(operation["overrides"], "overrides"),
        }
    if op_type == "settings.apply":
        require_exact_keys(operation, {"type", "settings"}, op_type)
        if not is_object(operation["settings"]):
            raise ProtocolError("settings must be an object")
        return {
            "type": op_type,
            "settings": canonicalize_json(operation["settings"]),
        }
    if op_type == "settings.patch_special_conds":
        require_exact_keys(operation, {"type", "patch"}, op_type)
        if not is_object(operation["patch"]):
            raise ProtocolError("patch must be an object")
        return {
            "type": op_type,
            "patch": canonicalize_json(operation["patch"]),
        }
    if op_type == "session.set_spoiler_log_state":
        require_exact_keys(operation, {"type", "imported", "ootmmVersion"}, op_type)
        if not isinstance(operation["imported"], bool):
            raise ProtocolError("imported must be a boolean")
        version = operation["ootmmVersion"]
        normalized_version = None if version is None else require_string(version, "ootmmVersion")
        return {
            "type": op_type,
            "imported": operation["imported"],
            "ootmmVersion": normalized_version,
        }
    require_exact_keys(operation, {"type"}, op_type)
    return {"type": op_type}


def reduce_snapshot(snapshot_envelope: dict[str, Any], envelope: dict[str, Any], *, captured_at: int) -> dict[str, Any]:
    state = copy.deepcopy(snapshot_envelope["state"])
    op = envelope["op"]
    op_type = op["type"]

    if op_type == "inventory.set_full":
        state["inventoryById"] = dict(op["inventoryById"])
    elif op_type == "inventory.set_count":
        inventory = dict(state["inventoryById"])
        count = op["count"]
        if count <= 0:
            inventory.pop(op["itemId"], None)
        else:
            inventory[op["itemId"]] = count
        state["inventoryById"] = dict(sorted(inventory.items(), key=lambda item: item[0]))
    elif op_type == "locations.set_collected":
        current = set(state["collectedLocationIds"])
        if op["collected"]:
            current.add(op["locationId"])
        else:
            current.discard(op["locationId"])
        state["collectedLocationIds"] = sorted(current)
    elif op_type == "locations.set_ids":
        state["collectedLocationIds"] = list(op["ids"])
    elif op_type == "locations.set_junk_ids":
        state["junkLocationIds"] = list(op["ids"])
    elif op_type == "world.set_precompleted":
        state["preCompletedDungeons"] = list(op["ids"])
    elif op_type == "world.set_song_events":
        state["songEvents"] = dict(op["events"])
    elif op_type == "world.set_shop_prices":
        state["shopPrices"] = dict(op["prices"])
    elif op_type == "world.set_shop_price":
        prices = dict(state["shopPrices"])
        if op["price"] is None:
            prices.pop(op["locationId"], None)
        else:
            prices[op["locationId"]] = op["price"]
        state["shopPrices"] = dict(sorted(prices.items(), key=lambda item: item[0]))
    elif op_type == "world.set_entrance_override":
        overrides = dict(state["entranceOverrides"])
        if op["dst"] is None:
            overrides.pop(op["src"], None)
        else:
            overrides[op["src"]] = op["dst"]
        state["entranceOverrides"] = dict(sorted(overrides.items(), key=lambda item: item[0]))
    elif op_type == "world.set_entrance_overrides":
        state["entranceOverrides"] = dict(op["overrides"])
    elif op_type == "settings.apply":
        state["trackerSettings"] = canonicalize_json(op["settings"])
    elif op_type == "settings.patch_special_conds":
        tracker_settings = copy.deepcopy(state["trackerSettings"])
        special_conds = tracker_settings.get("specialConds")
        base = special_conds if isinstance(special_conds, dict) else {}
        tracker_settings["specialConds"] = merge_json_object(base, op["patch"])
        state["trackerSettings"] = canonicalize_json(tracker_settings)
    elif op_type == "session.set_spoiler_log_state":
        state["hasImportedSpoilerLog"] = bool(op["imported"])
        state["importedSpoilerLogVersion"] = op["ootmmVersion"] if op["imported"] else None

    return {
        "protocolSchema": snapshot_envelope["protocolSchema"],
        "stateSchema": snapshot_envelope["stateSchema"],
        "stateType": snapshot_envelope["stateType"],
        "sessionId": snapshot_envelope["sessionId"],
        "baselineSeq": snapshot_envelope["baselineSeq"],
        "capturedAt": captured_at,
        "state": state,
    }


class RelayServer:
    def __init__(
        self,
        db_path: str,
        *,
        idle_prune_days: float = 7.0,
        max_db_bytes: int = MAX_DB_BYTES,
        max_new_rooms_per_minute: int = MAX_NEW_ROOMS_PER_MINUTE,
        max_clients_per_room: int = MAX_CLIENTS_PER_ROOM,
        max_rss_bytes: int = DEFAULT_MAX_RSS_BYTES,
        soft_max_rss_bytes: int = DEFAULT_SOFT_MAX_RSS_BYTES,
    ):
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        # auto_vacuum only takes effect on a fresh database; an existing file
        # created without it stays NONE until a one-time VACUUM. It lets the
        # idle-prune path return freed pages to the OS (see prune_idle_rooms) so
        # the size cap recovers after rooms are deleted instead of staying stuck
        # at the high-water mark.
        self.db.execute("PRAGMA auto_vacuum=INCREMENTAL")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.execute("PRAGMA foreign_keys=ON")
        self._init_db()
        self.rooms: dict[str, RoomState] = {}
        self.rooms_lock = asyncio.Lock()
        self.idle_prune_ms = max(0, int(idle_prune_days * 24 * 60 * 60 * 1000))
        self.max_db_bytes = max_db_bytes
        self.max_new_rooms_per_minute = max_new_rooms_per_minute
        self.max_clients_per_room = max_clients_per_room
        self.max_rss_bytes = max(0, max_rss_bytes)
        self.soft_max_rss_bytes = max(0, soft_max_rss_bytes)
        if (
            self.soft_max_rss_bytes > 0
            and self.max_rss_bytes > 0
            and self.soft_max_rss_bytes >= self.max_rss_bytes
        ):
            # The hard gate refuses sockets before they can send a join frame, so
            # a soft ceiling at or above it can never fire. Warn rather than fail:
            # a running relay is preferable to a startup crash over a config typo.
            LOG.warning(
                "soft RSS limit (%s) >= hard RSS limit (%s); the hard gate "
                "refuses connections first, so the soft new-room gate never fires",
                self.soft_max_rss_bytes,
                self.max_rss_bytes,
            )
        # Timestamps (ms) of recent room creations, oldest first. Guarded by
        # rooms_lock, same as every other room-creation path.
        self._recent_room_creations: deque[int] = deque()

    def _init_db(self) -> None:
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS rooms (
              room_id TEXT PRIMARY KEY,
              room_key TEXT NOT NULL,
              protocol_schema INTEGER NOT NULL,
              state_schema INTEGER NOT NULL,
              state_type TEXT NOT NULL,
              latest_seq INTEGER NOT NULL,
              snapshot_json TEXT NOT NULL,
              updated_at_ms INTEGER NOT NULL
            );
            """
        )
        self.db.commit()

    def _touch_room_activity(self, room_id: str, ts_ms: int) -> None:
        self.db.execute(
            "UPDATE rooms SET updated_at_ms = ? WHERE room_id = ?",
            (ts_ms, room_id),
        )
        self.db.commit()

    def _db_size_bytes(self) -> int:
        page_count = int(self.db.execute("PRAGMA page_count").fetchone()[0])
        page_size = int(self.db.execute("PRAGMA page_size").fetchone()[0])
        return page_count * page_size

    def _enforce_room_creation_limits(self) -> None:
        """Reject creating a new room when over the rate or storage ceiling.

        Caller must hold ``rooms_lock``. Only first-time creation is gated;
        joins to existing rooms never reach here.
        """
        now = now_ms()
        window = self._recent_room_creations
        cutoff = now - ROOM_CREATION_WINDOW_MS
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= self.max_new_rooms_per_minute:
            raise ProtocolError("room creation rate limit reached; try again shortly")
        if self._db_size_bytes() >= self.max_db_bytes:
            raise ProtocolError("server storage is full; no new rooms can be created")

    def _record_room_creation(self) -> None:
        self._recent_room_creations.append(now_ms())

    def _enforce_soft_rss_limit(self) -> None:
        """Reject materializing a not-yet-resident room over the soft RSS ceiling.

        Caller must hold ``rooms_lock``. No-op when unset (the default) or on
        platforms where ``current_rss_bytes`` returns 0. Only room materialization
        is gated; joins to a room already in ``self.rooms`` never reach here, so
        active sessions keep working. Raises ``ProtocolError`` so the join handler
        reports it to the client like the other room-creation ceilings.
        """
        if self.soft_max_rss_bytes <= 0:
            return
        rss = current_rss_bytes()
        if rss >= self.soft_max_rss_bytes:
            LOG.warning(
                "refusing new room: rss %s over soft limit %s",
                rss,
                self.soft_max_rss_bytes,
            )
            raise ProtocolError("server is busy; no new rooms right now")

    async def get_room(
        self, room_id: str, room_key: str, *, seed_snapshot: Any = None
    ) -> RoomState:
        async with self.rooms_lock:
            return self._get_or_create_room_locked(
                room_id, room_key, seed_snapshot=seed_snapshot
            )

    def _get_or_create_room_locked(
        self, room_id: str, room_key: str, *, seed_snapshot: Any = None
    ) -> RoomState:
        """Look up (or create) a room. Caller must hold ``rooms_lock``.

        This is kept lock-free so ``join`` can hold ``rooms_lock`` across both the
        lookup/creation here and the first-client registration. That single
        critical section is what stops a concurrent last-client ``disconnect``
        (which evicts an empty room under the same lock) from interleaving and
        leaving us with two in-memory ``RoomState`` objects for one room.
        """
        cached = self.rooms.get(room_id)
        if cached is not None:
            if not hmac.compare_digest(cached.room_key, room_key):
                raise ProtocolError("invalid roomKey")
            return cached

        # Not resident: whether this is a brand-new room or a reload from SQLite,
        # materializing it allocates a fresh in-memory snapshot -- the dominant
        # per-unit RSS cost. The soft ceiling refuses that step (before the DB
        # read) so groups already in memory keep working while the relay stops
        # admitting new ones. This is the gentle tier below the hard
        # process_request gate that refuses every socket.
        self._enforce_soft_rss_limit()

        row = self.db.execute(
            """
            SELECT room_key, latest_seq, snapshot_json
            FROM rooms
            WHERE room_id = ?
            """,
            (room_id,),
        ).fetchone()

        if row is None:
            # Brand-new room: gate creation on the rate/storage ceilings
            # (joins to existing rooms above never reach here), then seed it
            # from the joining client's snapshot if one was supplied, so
            # "Start coop" uploads the host's current state instead of
            # handing back an empty document.
            self._enforce_room_creation_limits()
            snapshot = (
                build_seed_snapshot_envelope(room_id, seed_snapshot)
                if seed_snapshot is not None
                else default_snapshot_envelope(room_id)
            )
            self.db.execute(
                """
                INSERT INTO rooms (
                  room_id,
                  room_key,
                  protocol_schema,
                  state_schema,
                  state_type,
                  latest_seq,
                  snapshot_json,
                  updated_at_ms
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    room_id,
                    room_key,
                    PROTOCOL_SCHEMA,
                    STATE_SCHEMA,
                    STATE_TYPE,
                    0,
                    json.dumps(snapshot, separators=(",", ":"), sort_keys=True),
                    now_ms(),
                ),
            )
            self.db.commit()
            self._record_room_creation()
            room = RoomState(
                room_id=room_id,
                room_key=room_key,
                latest_seq=0,
                snapshot_envelope=snapshot,
            )
            self.rooms[room_id] = room
            return room

        stored_key = str(row["room_key"])
        if not hmac.compare_digest(stored_key, room_key):
            raise ProtocolError("invalid roomKey")

        try:
            snapshot = json.loads(row["snapshot_json"])
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Stored snapshot for room {room_id!r} is invalid JSON") from exc

        room = RoomState(
            room_id=room_id,
            room_key=stored_key,
            latest_seq=int(row["latest_seq"]),
            snapshot_envelope=snapshot,
        )
        self.rooms[room_id] = room
        return room

    async def join(self, websocket: Any, join_message: dict[str, Any]) -> RoomState:
        # Hold rooms_lock across both materializing the room and registering this
        # first client (rooms_lock -> room.lock, the same order disconnect uses).
        # A concurrent last-client disconnect evicts an empty room from
        # self.rooms under rooms_lock; doing the lookup and the registration in
        # one critical section stops that eviction from slipping in between and
        # leaving us adding a client to a room that's no longer canonical.
        async with self.rooms_lock:
            room = self._get_or_create_room_locked(
                join_message["roomId"],
                join_message["roomKey"],
                seed_snapshot=join_message.get("seedSnapshot"),
            )
            async with room.lock:
                if len(room.clients) >= self.max_clients_per_room:
                    raise ProtocolError("room is full")
                client = ClientConnection(actor_id=join_message["actorId"])
                room.clients[websocket] = client
                client.sender_task = asyncio.create_task(
                    self._client_sender(websocket, client.outbox)
                )
                # Anything after registration that raises (realistically the
                # _touch_room_activity DB write) must undo the registration:
                # handler binds `room` from our return value, so a throw here
                # leaves it None and its finally-disconnect can't clean up,
                # stranding a phantom client that keeps the room unprunable.
                try:
                    self._touch_room_activity(room.room_id, now_ms())
                    joined_payload = json.dumps(
                        {
                            "type": "joined",
                            "roomId": room.room_id,
                            "baselineSeq": room.latest_seq,
                            "peerCount": len(room.clients),
                        },
                        separators=(",", ":"),
                        sort_keys=True,
                    )
                    snapshot_payload = json.dumps(
                        {
                            "type": "snapshot",
                            "snapshotEnvelope": room.snapshot_envelope,
                        },
                        separators=(",", ":"),
                        sort_keys=True,
                    )
                    client.outbox.put_nowait(joined_payload)
                    client.outbox.put_nowait(snapshot_payload)
                    self._broadcast_peer_count(room, exclude=websocket)
                except BaseException:
                    room.clients.pop(websocket, None)
                    client.sender_task.cancel()
                    raise
        LOG.info(
            "joined room_id=%s actor_id=%s peers=%s",
            room.room_id,
            join_message["actorId"],
            len(room.clients),
        )
        return room

    async def _client_sender(self, websocket: Any, outbox: asyncio.Queue) -> None:
        try:
            while True:
                payload = await outbox.get()
                try:
                    if payload is None:
                        return
                    await websocket.send(payload)
                except ConnectionClosed:
                    return
                except Exception:
                    LOG.exception("client sender failed")
                    return
                finally:
                    outbox.task_done()
        except asyncio.CancelledError:
            return

    async def _close_quietly(self, websocket: Any) -> None:
        try:
            await websocket.close(
                code=SLOW_PEER_CLOSE_CODE, reason=SLOW_PEER_CLOSE_REASON
            )
        except Exception:
            pass

    def _enqueue_to_all(
        self, room: RoomState, payload: str, *, exclude: Any = None
    ) -> list[Any]:
        slow: list[Any] = []
        for ws in list(room.clients):
            if ws is exclude:
                continue
            client = room.clients[ws]
            try:
                client.outbox.put_nowait(payload)
            except asyncio.QueueFull:
                slow.append(ws)
        return slow

    def _drop_clients(self, room: RoomState, websockets_to_drop: list[Any]) -> None:
        for ws in websockets_to_drop:
            client = room.clients.pop(ws, None)
            if client is None:
                continue
            if client.sender_task is not None and not client.sender_task.done():
                client.sender_task.cancel()
            asyncio.create_task(self._close_quietly(ws))

    def _broadcast_peer_count(self, room: RoomState, *, exclude: Any = None) -> None:
        while True:
            payload = json.dumps(
                {"type": "peers", "peerCount": len(room.clients)},
                separators=(",", ":"),
                sort_keys=True,
            )
            slow = self._enqueue_to_all(room, payload, exclude=exclude)
            if not slow:
                return
            self._drop_clients(room, slow)

    def _broadcast(
        self, room: RoomState, payload: str, *, exclude: Any = None
    ) -> None:
        slow = self._enqueue_to_all(room, payload, exclude=exclude)
        if not slow:
            return
        self._drop_clients(room, slow)
        self._broadcast_peer_count(room, exclude=exclude)

    async def handle_operation(self, room: RoomState, websocket: Any, envelope: dict[str, Any]) -> None:
        async with room.lock:
            client = room.clients.get(websocket)
            if client is None:
                raise ProtocolError("client is not joined")
            # No server-side opId dedup: every op is an absolute set/replace, so
            # reduce_snapshot is idempotent and reapplying a duplicate yields the
            # same snapshot. Clients also dedup by opId. If a non-idempotent
            # (delta) op is ever added, dedup must come back.
            committed_at = now_ms()
            next_seq = room.latest_seq + 1
            next_snapshot = reduce_snapshot(room.snapshot_envelope, envelope, captured_at=committed_at)
            next_snapshot["baselineSeq"] = next_seq

            next_snapshot_json = json.dumps(
                next_snapshot, separators=(",", ":"), sort_keys=True
            )
            if len(next_snapshot_json.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
                # Refuse to let the room grow past what peers can receive; this
                # keeps the room joinable instead of bricking it.
                raise ProtocolError("room state too large")

            # Single statement, so the implicit transaction is enough; the
            # rollback guard keeps a failed write from leaving an open
            # transaction on the shared connection.
            try:
                self.db.execute(
                    """
                    UPDATE rooms
                    SET latest_seq = ?, snapshot_json = ?, updated_at_ms = ?
                    WHERE room_id = ?
                    """,
                    (
                        next_seq,
                        next_snapshot_json,
                        committed_at,
                        room.room_id,
                    ),
                )
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise

            room.latest_seq = next_seq
            room.snapshot_envelope = next_snapshot

            payload = json.dumps(
                {
                    "type": "op",
                    "serverSeq": next_seq,
                    "envelope": envelope,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
            self._broadcast(room, payload)

    async def disconnect(self, room: RoomState | None, websocket: Any) -> None:
        if room is None:
            return
        # rooms_lock -> room.lock matches the order join uses, so evicting an
        # empty room here can never race a concurrent join into a split room.
        async with self.rooms_lock:
            async with room.lock:
                removed = room.clients.pop(websocket, None)
                if removed is not None:
                    if (
                        removed.sender_task is not None
                        and not removed.sender_task.done()
                    ):
                        removed.sender_task.cancel()
                    self._broadcast_peer_count(room)
                # Drop the room from memory once its last client leaves. It stays
                # durable in SQLite and reloads lazily via get_room on the next
                # join, so nothing is lost. Without this, self.rooms retains every
                # room touched since startup until the 7-day idle prune, making
                # memory track total rooms rather than concurrently active ones.
                # The `is room` guard avoids evicting a different object a
                # concurrent join may already have installed in this slot.
                if not room.clients and self.rooms.get(room.room_id) is room:
                    self.rooms.pop(room.room_id, None)

    async def prune_idle_rooms(self, *, now: int | None = None) -> int:
        if self.idle_prune_ms <= 0:
            return 0
        threshold = (now if now is not None else now_ms()) - self.idle_prune_ms
        async with self.rooms_lock:
            rows = self.db.execute(
                "SELECT room_id FROM rooms WHERE updated_at_ms < ?",
                (threshold,),
            ).fetchall()
            removed = 0
            for row in rows:
                room_id = row["room_id"]
                if room_id in self.rooms and self.rooms[room_id].clients:
                    continue
                self.db.execute("DELETE FROM rooms WHERE room_id = ?", (room_id,))
                self.rooms.pop(room_id, None)
                removed += 1
            self.db.commit()
            if removed:
                # Return the freed pages to the OS so the size cap recovers
                # instead of staying pinned at the high-water mark. The result
                # rows must be drained or only a single page is reclaimed. No-op
                # unless the database is in auto_vacuum=INCREMENTAL mode.
                self.db.execute("PRAGMA incremental_vacuum").fetchall()
                self.db.commit()
        if removed:
            LOG.info("pruned idle rooms count=%s", removed)
        return removed

    async def _idle_prune_loop(self, interval_sec: int) -> None:
        while True:
            try:
                await asyncio.sleep(interval_sec)
                await self.prune_idle_rooms()
            except asyncio.CancelledError:
                raise
            except Exception:
                LOG.exception("idle prune loop failed")

    async def handler(self, websocket: Any) -> None:
        room: RoomState | None = None
        join_actor_id = "<unknown>"

        try:
            try:
                raw = await asyncio.wait_for(
                    websocket.recv(), timeout=JOIN_TIMEOUT_SEC
                )
            except asyncio.TimeoutError:
                await websocket.close(code=1008, reason="join timeout")
                return
            if not isinstance(raw, str):
                raise ProtocolError("binary messages are not supported")
            join_message = normalize_join_message(parse_json_message(raw))
            join_actor_id = join_message["actorId"]
            room = await self.join(websocket, join_message)

            async for raw in websocket:
                if not isinstance(raw, str):
                    raise ProtocolError("binary messages are not supported")
                message = normalize_op_message(parse_json_message(raw), room.room_id)
                await self.handle_operation(room, websocket, message["envelope"])
        except ProtocolError as exc:
            LOG.warning("protocol error actor_id=%s detail=%s", join_actor_id, exc)
            if room is not None:
                client = room.clients.get(websocket)
                if (
                    client is not None
                    and client.sender_task is not None
                    and not client.sender_task.done()
                ):
                    client.sender_task.cancel()
                    try:
                        await client.sender_task
                    except asyncio.CancelledError:
                        pass
            try:
                await websocket.send(
                    json.dumps(
                        {
                            "type": "error",
                            "message": str(exc),
                        },
                        separators=(",", ":"),
                        sort_keys=True,
                    )
                )
            except ConnectionClosed:
                pass
            await websocket.close(code=1008, reason="protocol error")
        except ConnectionClosed:
            pass
        finally:
            await self.disconnect(room, websocket)

    async def process_request(self, arg1: Any, arg2: Any) -> Any:
        # Support both websockets calling conventions so healthz and the RSS gate
        # work regardless of the installed version:
        #   * >= 14 (new asyncio API): (connection, request); path is
        #     request.path and a response is built via connection.respond(...).
        #   * legacy 10.x (shipped as some distros' system package): (path,
        #     request_headers); a response is a (status, headers, body) tuple.
        # Returning None from either lets the WebSocket handshake proceed.
        if isinstance(arg1, str):
            path = arg1

            def deny(status: http.HTTPStatus, body: str) -> Any:
                return (status, [], body.encode("utf-8"))
        else:
            connection = arg1
            path = getattr(arg2, "path", None)

            def deny(status: http.HTTPStatus, body: str) -> Any:
                return connection.respond(status, body)

        if path == "/healthz":
            return deny(http.HTTPStatus.OK, "ok\n")
        # Hard tier: refuse the WebSocket upgrade for every new socket before any
        # room or client is allocated once RSS hits the hard ceiling. This is the
        # backstop just below a cgroup OOM-kill; the soft tier in
        # _get_or_create_room_locked stops *new rooms* earlier and more gently
        # while letting sockets rejoin resident rooms. Already-connected sockets
        # are untouched; refused clients hit their normal reconnect backoff and
        # return once memory recovers (as empty rooms are evicted and idle rooms
        # pruned).
        if self.max_rss_bytes > 0:
            rss = current_rss_bytes()
            if rss >= self.max_rss_bytes:
                LOG.warning(
                    "refusing connection: rss %s over limit %s (path=%s)",
                    rss,
                    self.max_rss_bytes,
                    path,
                )
                return deny(
                    http.HTTPStatus.SERVICE_UNAVAILABLE, "server at capacity\n"
                )
        return None

    async def run(self, host: str, port: int, allowed_origins: list[str]) -> None:
        LOG.info("starting sync relay host=%s port=%s", host, port)
        async with websockets.serve(
            self.handler,
            host,
            port,
            max_size=MAX_MESSAGE_BYTES,
            origins=allowed_origins or None,
            ping_interval=20,
            ping_timeout=20,
            compression=None,
            process_request=self.process_request,
        ):
            prune_task: asyncio.Task[None] | None = None
            if self.idle_prune_ms > 0:
                prune_task = asyncio.create_task(
                    self._idle_prune_loop(IDLE_PRUNE_INTERVAL_SEC)
                )

            stop_event = asyncio.Event()

            def _stop() -> None:
                stop_event.set()

            loop = asyncio.get_running_loop()
            for sig in (signal.SIGINT, signal.SIGTERM):
                try:
                    loop.add_signal_handler(sig, _stop)
                except NotImplementedError:
                    pass

            try:
                await stop_event.wait()
            finally:
                if prune_task is not None:
                    prune_task.cancel()
                    try:
                        await prune_task
                    except asyncio.CancelledError:
                        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="The Last Tracker sync relay")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    parser.add_argument(
        "--db",
        default="server/sync.db",
        help="SQLite database path (default: server/sync.db)",
    )
    parser.add_argument(
        "--allow-origin",
        action="append",
        default=[],
        help="Allowed Origin header. Repeat to allow multiple origins.",
    )
    parser.add_argument(
        "--idle-prune-days",
        type=float,
        default=7.0,
        help="Delete rooms idle for this many days (default: 7; set to 0 to disable).",
    )
    parser.add_argument(
        "--max-rss-mb",
        type=float,
        default=0.0,
        help=(
            "Hard tier: refuse all new connections once process RSS reaches this "
            "many MB (default: 0 = disabled; Linux only). Existing rooms keep "
            "working."
        ),
    )
    parser.add_argument(
        "--soft-max-rss-mb",
        type=float,
        default=0.0,
        help=(
            "Soft tier: stop creating or reloading rooms once process RSS reaches "
            "this many MB, while rooms already in memory keep working (default: "
            "0 = disabled; Linux only). Set below --max-rss-mb as a gentler first "
            "step before the hard gate."
        ),
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )
    args = parser.parse_args()
    if not args.allow_origin:
        parser.error("--allow-origin is required (repeat to allow multiple origins)")
    return args


async def amain() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    relay = RelayServer(
        args.db,
        idle_prune_days=args.idle_prune_days,
        max_rss_bytes=int(args.max_rss_mb * 1024 * 1024),
        soft_max_rss_bytes=int(args.soft_max_rss_mb * 1024 * 1024),
    )
    await relay.run(args.host, args.port, args.allow_origin)


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
