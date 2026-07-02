from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from server.relay import (
    MAX_SNAPSHOT_BYTES,
    ProtocolError,
    RelayServer,
    ROOM_CREATION_WINDOW_MS,
    current_rss_bytes,
    normalize_join_message,
)


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.closed = False
        self.close_code: int | None = None
        self.close_reason: str | None = None

    async def send(self, payload: str) -> None:
        self.sent.append(payload)

    async def close(self, code: int | None = None, reason: str | None = None) -> None:
        self.closed = True
        self.close_code = code
        self.close_reason = reason


async def _cancel_sender_tasks(relay: RelayServer) -> None:
    for room in list(relay.rooms.values()):
        for client in list(room.clients.values()):
            task = client.sender_task
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass


class FakeIncomingWebSocket(FakeWebSocket):
    def __init__(self, incoming: list[str]) -> None:
        super().__init__()
        self._incoming = incoming

    async def recv(self) -> str:
        if not self._incoming:
            raise AssertionError("recv called with no messages queued")
        return self._incoming.pop(0)

    def __aiter__(self) -> "FakeIncomingWebSocket":
        return self

    async def __anext__(self) -> str:
        if not self._incoming:
            raise StopAsyncIteration
        return self._incoming.pop(0)


class HangingWebSocket(FakeWebSocket):
    """A socket whose recv() never resolves, to exercise the join timeout."""

    async def recv(self) -> str:
        await asyncio.Future()
        raise AssertionError("unreachable")


class RelayIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")
        self.relay = RelayServer(self.db_path, idle_prune_days=7.0)
        self.room_id = "integrationroom"
        self.room_key = "integrationkey0"
        # Materialize the room the same way a first join would (auto-create).
        await self.relay.get_room(self.room_id, self.room_key)

    async def asyncTearDown(self) -> None:
        await _cancel_sender_tasks(self.relay)
        self.relay.db.close()
        self.tmpdir.cleanup()

    async def _drain_room(self) -> None:
        room = self.relay.rooms.get(self.room_id)
        if room is None:
            return
        pending = [client.outbox.join() for client in list(room.clients.values())]
        if pending:
            await asyncio.gather(*pending)

    async def connect(
        self,
        actor_id: str = "actor-a",
        room_key: str | None = None,
    ):
        websocket = FakeWebSocket()
        join_message = {
            "type": "join",
            "roomId": self.room_id,
            "roomKey": room_key if room_key is not None else self.room_key,
            "actorId": actor_id,
        }
        await self.relay.join(websocket, join_message)
        await self._drain_room()
        joined = json.loads(websocket.sent[0])
        snapshot = json.loads(websocket.sent[1])
        return websocket, joined, snapshot

    async def test_join_sends_snapshot_and_baseline(self) -> None:
        _, joined, snapshot = await self.connect()
        self.assertEqual(
            joined,
            {
                "type": "joined",
                "roomId": self.room_id,
                "baselineSeq": 0,
                "peerCount": 1,
            },
        )
        self.assertEqual(snapshot["type"], "snapshot")
        envelope = snapshot["snapshotEnvelope"]
        self.assertEqual(envelope["sessionId"], self.room_id)
        self.assertEqual(envelope["baselineSeq"], 0)
        self.assertEqual(envelope["state"]["inventoryById"], {})
        self.assertEqual(envelope["state"]["junkLocationIds"], [])
        self.assertFalse(envelope["state"]["hasImportedSpoilerLog"])
        self.assertIsNone(envelope["state"]["importedSpoilerLogVersion"])

    async def test_join_unknown_room_auto_creates_it(self) -> None:
        new_room_id = "autocreatedroom"
        new_room_key = "autocreatedkey"
        await self.relay.join(
            FakeWebSocket(),
            {
                "type": "join",
                "roomId": new_room_id,
                "roomKey": new_room_key,
                "actorId": "actor-x",
            },
        )
        new_room = self.relay.rooms.get(new_room_id)
        if new_room is not None:
            pending = [
                client.outbox.join() for client in list(new_room.clients.values())
            ]
            if pending:
                await asyncio.gather(*pending)
        row = self.relay.db.execute(
            "SELECT room_key FROM rooms WHERE room_id = ?",
            (new_room_id,),
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["room_key"], new_room_key)

        with self.assertRaises(ProtocolError) as cm:
            await self.relay.join(
                FakeWebSocket(),
                {
                    "type": "join",
                    "roomId": new_room_id,
                    "roomKey": "wrongkey",
                    "actorId": "actor-y",
                },
            )
        self.assertEqual(str(cm.exception), "invalid roomKey")

    def test_normalize_join_accepts_optional_snapshot(self) -> None:
        # The real browser client always attaches a snapshotEnvelope. This is the
        # exact validator that previously rejected every real join.
        seed = {"state": {"inventoryById": {"OOT_BOW": 2}}}
        normalized = normalize_join_message(
            {
                "type": "join",
                "roomId": "roomcode1",
                "roomKey": "roomkey01",
                "actorId": "actor-a",
                "snapshotEnvelope": seed,
            }
        )
        self.assertEqual(normalized["seedSnapshot"], seed)

        without = normalize_join_message(
            {
                "type": "join",
                "roomId": "roomcode1",
                "roomKey": "roomkey01",
                "actorId": "actor-a",
            }
        )
        self.assertIsNone(without["seedSnapshot"])

        with self.assertRaises(ProtocolError):
            normalize_join_message(
                {
                    "type": "join",
                    "roomId": "roomcode1",
                    "roomKey": "roomkey01",
                    "actorId": "actor-a",
                    "bogus": 1,
                }
            )

        with self.assertRaises(ProtocolError):
            normalize_join_message(
                {
                    "type": "join",
                    "roomId": "room-code1",
                    "roomKey": "roomkey01",
                    "actorId": "actor-a",
                }
            )

    def test_normalize_join_rejects_short_room_code(self) -> None:
        # Codes shorter than ROOM_CODE_MIN_LENGTH are refused so a trivially
        # brute-forceable room can never be opened.
        for short_code in ("room1", "key1", "abc"):
            with self.assertRaises(ProtocolError):
                normalize_join_message(
                    {
                        "type": "join",
                        "roomId": short_code,
                        "roomKey": "roomkey01",
                        "actorId": "actor-a",
                    }
                )
            with self.assertRaises(ProtocolError):
                normalize_join_message(
                    {
                        "type": "join",
                        "roomId": "roomcode1",
                        "roomKey": short_code,
                        "actorId": "actor-a",
                    }
                )

    async def test_join_seeds_new_room_from_snapshot(self) -> None:
        join_message = normalize_join_message(
            {
                "type": "join",
                "roomId": "seededroom",
                "roomKey": "seededkey",
                "actorId": "actor-a",
                "snapshotEnvelope": {
                    "state": {
                        "inventoryById": {"OOT_BOW": 3, "OOT_ZERO": 0},
                        "collectedLocationIds": ["LOC_B", "LOC_A"],
                        "hasImportedSpoilerLog": True,
                        "importedSpoilerLogVersion": "1.2.3",
                    }
                },
            }
        )
        await self.relay.join(FakeWebSocket(), join_message)
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                ("seededroom",),
            ).fetchone()["snapshot_json"]
        )
        state = snapshot["state"]
        # Zero-count items dropped, ids sorted, spoiler state preserved.
        self.assertEqual(state["inventoryById"], {"OOT_BOW": 3})
        self.assertEqual(state["collectedLocationIds"], ["LOC_A", "LOC_B"])
        self.assertTrue(state["hasImportedSpoilerLog"])
        self.assertEqual(state["importedSpoilerLogVersion"], "1.2.3")

    async def test_seed_is_ignored_for_existing_room(self) -> None:
        # self.room_id already exists (created in setUp) with empty state.
        join_message = normalize_join_message(
            {
                "type": "join",
                "roomId": self.room_id,
                "roomKey": self.room_key,
                "actorId": "actor-a",
                "snapshotEnvelope": {
                    "state": {"inventoryById": {"OOT_BOW": 9}},
                },
            }
        )
        await self.relay.join(FakeWebSocket(), join_message)
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()["snapshot_json"]
        )
        self.assertEqual(snapshot["state"]["inventoryById"], {})

    async def test_room_is_evicted_from_memory_when_last_client_leaves(self) -> None:
        # A room is held in memory only while it has clients. When the last one
        # disconnects it is dropped from self.rooms (so memory tracks active
        # rooms, not every room touched since startup), but it stays durable in
        # SQLite — a later join reloads it with state intact, no loss, no split.
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(
            room,
            websocket,
            {
                "protocolSchema": 1,
                "sessionId": self.room_id,
                "opId": "op-1",
                "actorId": "actor-a",
                "clientClock": 1,
                "ts": 1000,
                "op": {"type": "inventory.set_count", "itemId": "OOT_BOW", "count": 3},
            },
        )
        self.assertIn(self.room_id, self.relay.rooms)

        await self.relay.disconnect(self.relay.rooms.get(self.room_id), websocket)

        # Evicted from memory, but the row survives in the database.
        self.assertNotIn(self.room_id, self.relay.rooms)
        row = self.relay.db.execute(
            "SELECT 1 FROM rooms WHERE room_id = ?",
            (self.room_id,),
        ).fetchone()
        self.assertIsNotNone(row)

        # A later join reloads the room from SQLite with its committed state.
        _, joined, snapshot = await self.connect(actor_id="actor-b")
        self.assertIn(self.room_id, self.relay.rooms)
        self.assertEqual(joined["baselineSeq"], 1)
        self.assertEqual(
            snapshot["snapshotEnvelope"]["state"]["inventoryById"],
            {"OOT_BOW": 3},
        )

    async def test_join_cleans_up_client_when_activity_write_fails(self) -> None:
        # If a DB error strikes after the client is registered (realistically the
        # _touch_room_activity write), join must undo the registration. Otherwise
        # handler's `room` stays None, its finally-disconnect no-ops, and a
        # phantom client keeps the room unprunable and inflates peerCount forever.
        websocket = FakeWebSocket()
        join_message = {
            "type": "join",
            "roomId": self.room_id,
            "roomKey": self.room_key,
            "actorId": "doomed",
        }
        with patch.object(
            self.relay,
            "_touch_room_activity",
            side_effect=sqlite3.OperationalError("disk I/O error"),
        ):
            with self.assertRaises(sqlite3.OperationalError):
                await self.relay.join(websocket, join_message)

        room = self.relay.rooms[self.room_id]
        # No phantom client left behind, so the room stays prunable.
        self.assertEqual(len(room.clients), 0)
        self.assertNotIn(websocket, room.clients)

        # A later healthy join sees a clean room: peerCount 1, not 2.
        _, joined, _ = await self.connect(actor_id="actor-b")
        self.assertEqual(joined["peerCount"], 1)

    async def test_op_exceeding_snapshot_cap_is_rejected(self) -> None:
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        # Few enough entries to stay under MAX_JSON_ITEMS, but long keys push the
        # serialized snapshot past MAX_SNAPSHOT_BYTES.
        key_len = 200
        entries = (MAX_SNAPSHOT_BYTES // key_len) + 64
        huge_inventory = {f"ITEM_{i:0>{key_len - 5}}": 1 for i in range(entries)}
        with self.assertRaises(ProtocolError) as cm:
            await self.relay.handle_operation(
                room,
                websocket,
                {
                    "protocolSchema": 1,
                    "sessionId": self.room_id,
                    "opId": "op-huge",
                    "actorId": "actor-a",
                    "clientClock": 1,
                    "ts": 1000,
                    "op": {"type": "inventory.set_full", "inventoryById": huge_inventory},
                },
            )
        self.assertEqual(str(cm.exception), "room state too large")
        # The room is unchanged and still joinable.
        row = self.relay.db.execute(
            "SELECT latest_seq FROM rooms WHERE room_id = ?",
            (self.room_id,),
        ).fetchone()
        self.assertEqual(row["latest_seq"], 0)

    async def test_duplicate_op_id_is_reapplied_idempotently(self) -> None:
        # The server no longer dedups by opId; every op is an absolute
        # set/replace, so reapplying a duplicate must leave the state identical
        # to applying it once. (That idempotency is what makes dropping the
        # seen_ops table safe.)
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        envelope = {
            "protocolSchema": 1,
            "sessionId": self.room_id,
            "opId": "same-op",
            "actorId": "actor-a",
            "clientClock": 1,
            "ts": 1000,
            "op": {
                "type": "inventory.set_count",
                "itemId": "OOT_BOW",
                "count": 1,
            },
        }

        await self.relay.handle_operation(room, websocket, envelope)
        await self.relay.handle_operation(room, websocket, envelope)
        await self._drain_room()

        # Without dedup the duplicate is rebroadcast; peers tolerate it because
        # they dedup by opId client-side.
        op_events = [json.loads(msg) for msg in websocket.sent if json.loads(msg).get("type") == "op"]
        self.assertEqual(len(op_events), 2)
        self.assertEqual([e["serverSeq"] for e in op_events], [1, 2])

        row = self.relay.db.execute(
            "SELECT latest_seq, snapshot_json FROM rooms WHERE room_id = ?",
            (self.room_id,),
        ).fetchone()
        self.assertEqual(row["latest_seq"], 2)
        snapshot = json.loads(row["snapshot_json"])
        self.assertEqual(snapshot["baselineSeq"], 2)
        # Idempotent: the state is the same as if the op had been applied once.
        self.assertEqual(snapshot["state"]["inventoryById"], {"OOT_BOW": 1})

    async def test_handler_drops_connection_without_timely_join(self) -> None:
        websocket = HangingWebSocket()
        with patch("server.relay.JOIN_TIMEOUT_SEC", 0.01):
            await self.relay.handler(websocket)
        self.assertTrue(websocket.closed)
        self.assertEqual(websocket.close_code, 1008)
        self.assertEqual(websocket.close_reason, "join timeout")

    async def test_invalid_room_key_is_rejected(self) -> None:
        with self.assertRaises(ProtocolError) as cm:
            await self.relay.join(
                FakeWebSocket(),
                {
                    "type": "join",
                    "roomId": self.room_id,
                    "roomKey": "wrongkey",
                    "actorId": "actor-b",
                },
            )
        self.assertEqual(str(cm.exception), "invalid roomKey")

    async def test_second_join_sees_updated_snapshot_baseline(self) -> None:
        first, _, _ = await self.connect(actor_id="actor-a")
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(
            room,
            first,
            {
                "protocolSchema": 1,
                "sessionId": self.room_id,
                "opId": "op-1",
                "actorId": "actor-a",
                "clientClock": 1,
                "ts": 1000,
                "op": {
                    "type": "locations.set_collected",
                    "locationId": "LOCATION_1",
                    "collected": True,
                },
            },
        )

        second, joined, snapshot = await self.connect(actor_id="actor-b")
        self.assertEqual(joined["baselineSeq"], 1)
        self.assertEqual(snapshot["snapshotEnvelope"]["baselineSeq"], 1)
        self.assertEqual(
            snapshot["snapshotEnvelope"]["state"]["collectedLocationIds"],
            ["LOCATION_1"],
        )
        self.assertEqual(joined["peerCount"], 2)

    async def test_join_broadcasts_peer_count_to_existing_clients(self) -> None:
        first, _, _ = await self.connect(actor_id="actor-a")
        before = len(first.sent)
        await self.connect(actor_id="actor-b")
        peer_events = [
            json.loads(msg)
            for msg in first.sent[before:]
            if json.loads(msg).get("type") == "peers"
        ]
        self.assertEqual(peer_events[-1]["peerCount"], 2)

    async def test_anyone_with_room_key_can_write(self) -> None:
        await self.connect(actor_id="actor-a")
        second, _, _ = await self.connect(actor_id="actor-b")
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(
            room,
            second,
            {
                "protocolSchema": 1,
                "sessionId": self.room_id,
                "opId": "op-from-second",
                "actorId": "actor-b",
                "clientClock": 1,
                "ts": 1000,
                "op": {
                    "type": "inventory.set_count",
                    "itemId": "OOT_BOW",
                    "count": 1,
                },
            },
        )
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()["snapshot_json"]
        )
        self.assertEqual(snapshot["state"]["inventoryById"], {"OOT_BOW": 1})

    async def test_set_spoiler_log_state_op(self) -> None:
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(
            room,
            websocket,
            {
                "protocolSchema": 1,
                "sessionId": self.room_id,
                "opId": "op-spoiler",
                "actorId": "actor-a",
                "clientClock": 1,
                "ts": 1000,
                "op": {
                    "type": "session.set_spoiler_log_state",
                    "imported": True,
                    "ootmmVersion": "1.2.3",
                },
            },
        )
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()["snapshot_json"]
        )
        self.assertTrue(snapshot["state"]["hasImportedSpoilerLog"])
        self.assertEqual(snapshot["state"]["importedSpoilerLogVersion"], "1.2.3")

    async def test_set_junk_ids_op(self) -> None:
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(
            room,
            websocket,
            {
                "protocolSchema": 1,
                "sessionId": self.room_id,
                "opId": "op-junk",
                "actorId": "actor-a",
                "clientClock": 1,
                "ts": 1000,
                # handle_operation receives an already-normalized envelope
                # (normalize_operation runs earlier in the handler); dedup/sort
                # of ids is covered by test_join_seeds_junk_location_ids.
                "op": {
                    "type": "locations.set_junk_ids",
                    "ids": ["LOC_A", "LOC_B"],
                },
            },
        )
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()["snapshot_json"]
        )
        # Stored, and kept separate from collectedLocationIds.
        self.assertEqual(snapshot["state"]["junkLocationIds"], ["LOC_A", "LOC_B"])
        self.assertEqual(snapshot["state"]["collectedLocationIds"], [])

    async def test_join_seeds_junk_location_ids(self) -> None:
        join_message = normalize_join_message(
            {
                "type": "join",
                "roomId": "junkseedroom",
                "roomKey": "junkseedkey0",
                "actorId": "actor-a",
                "snapshotEnvelope": {
                    "state": {"junkLocationIds": ["LOC_Z", "LOC_A"]},
                },
            }
        )
        await self.relay.join(FakeWebSocket(), join_message)
        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                ("junkseedroom",),
            ).fetchone()["snapshot_json"]
        )
        self.assertEqual(snapshot["state"]["junkLocationIds"], ["LOC_A", "LOC_Z"])

    async def test_slow_peer_is_evicted_and_does_not_block_room(self) -> None:
        fast, _, _ = await self.connect(actor_id="fast")
        slow, _, _ = await self.connect(actor_id="slow")
        room = self.relay.rooms[self.room_id]

        slow_client = room.clients[slow]
        slow_client.sender_task.cancel()
        try:
            await slow_client.sender_task
        except asyncio.CancelledError:
            pass
        while not slow_client.outbox.full():
            slow_client.outbox.put_nowait("dummy")

        envelope = {
            "protocolSchema": 1,
            "sessionId": self.room_id,
            "opId": "op-broadcast",
            "actorId": "fast",
            "clientClock": 1,
            "ts": 1000,
            "op": {"type": "inventory.set_count", "itemId": "OOT_BOW", "count": 1},
        }
        await self.relay.handle_operation(room, fast, envelope)
        for _ in range(5):
            await asyncio.sleep(0)

        self.assertNotIn(slow, room.clients)
        self.assertIn(fast, room.clients)
        self.assertTrue(
            slow.closed or slow.close_code is not None,
            msg="slow peer should be scheduled for close",
        )

        await room.clients[fast].outbox.join()
        types_seen = [json.loads(msg).get("type") for msg in fast.sent]
        self.assertIn("op", types_seen)
        self.assertEqual(types_seen[-1], "peers")
        peers_payloads = [json.loads(m) for m in fast.sent if json.loads(m).get("type") == "peers"]
        self.assertEqual(peers_payloads[-1]["peerCount"], 1)

    async def test_handler_sends_error_and_closes_on_protocol_violation(self) -> None:
        websocket = FakeIncomingWebSocket(
            [
                json.dumps(
                    {
                        "type": "join",
                        "roomId": self.room_id,
                        "roomKey": self.room_key,
                        "actorId": "actor-a",
                    }
                ),
                json.dumps({"type": "bogus"}),
            ]
        )

        with self.assertLogs("tlt.sync_relay", level="WARNING") as logs:
            await self.relay.handler(websocket)

        self.assertTrue(
            any("protocol error" in line for line in logs.output),
            logs.output,
        )

        error_events = [
            json.loads(msg)
            for msg in websocket.sent
            if json.loads(msg).get("type") == "error"
        ]
        self.assertEqual(len(error_events), 1)
        self.assertEqual(websocket.close_code, 1008)
        self.assertEqual(websocket.close_reason, "protocol error")


class IdlePruneTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")
        self.relay = RelayServer(self.db_path, idle_prune_days=0.0001)

    async def asyncTearDown(self) -> None:
        await _cancel_sender_tasks(self.relay)
        self.relay.db.close()
        self.tmpdir.cleanup()

    async def test_prune_deletes_idle_rooms_without_clients(self) -> None:
        room_id = room_key = "prunedroom01"
        websocket = FakeWebSocket()
        await self.relay.join(
            websocket,
            {
                "type": "join",
                "roomId": room_id,
                "roomKey": room_key,
                "actorId": "actor-a",
            },
        )
        await self.relay.disconnect(self.relay.rooms.get(room_id), websocket)
        self.relay.db.execute(
            "UPDATE rooms SET updated_at_ms = 0 WHERE room_id = ?",
            (room_id,),
        )
        self.relay.db.commit()

        removed = await self.relay.prune_idle_rooms()

        self.assertEqual(removed, 1)
        row = self.relay.db.execute(
            "SELECT 1 FROM rooms WHERE room_id = ?",
            (room_id,),
        ).fetchone()
        self.assertIsNone(row)

    async def test_prune_keeps_rooms_with_active_clients(self) -> None:
        room_id = room_key = "activeroom01"
        websocket = FakeWebSocket()
        await self.relay.join(
            websocket,
            {
                "type": "join",
                "roomId": room_id,
                "roomKey": room_key,
                "actorId": "actor-a",
            },
        )
        self.relay.db.execute(
            "UPDATE rooms SET updated_at_ms = 0 WHERE room_id = ?",
            (room_id,),
        )
        self.relay.db.commit()

        removed = await self.relay.prune_idle_rooms()

        self.assertEqual(removed, 0)
        row = self.relay.db.execute(
            "SELECT 1 FROM rooms WHERE room_id = ?",
            (room_id,),
        ).fetchone()
        self.assertIsNotNone(row)

    async def test_prune_disabled_when_idle_days_zero(self) -> None:
        relay = RelayServer(str(Path(self.tmpdir.name) / "disabled.db"), idle_prune_days=0)
        try:
            room_id = room_key = "disabledroom"
            websocket = FakeWebSocket()
            await relay.join(
                websocket,
                {
                    "type": "join",
                    "roomId": room_id,
                    "roomKey": room_key,
                    "actorId": "actor-a",
                },
            )
            await relay.disconnect(relay.rooms.get(room_id), websocket)
            relay.db.execute(
                "UPDATE rooms SET updated_at_ms = 0 WHERE room_id = ?",
                (room_id,),
            )
            relay.db.commit()

            removed = await relay.prune_idle_rooms()
            self.assertEqual(removed, 0)
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()

    async def test_fresh_db_uses_incremental_auto_vacuum(self) -> None:
        mode = self.relay.db.execute("PRAGMA auto_vacuum").fetchone()[0]
        self.assertEqual(mode, 2)  # 2 == INCREMENTAL

    async def test_prune_reclaims_disk_via_incremental_vacuum(self) -> None:
        # A room with a sizable snapshot spans several pages; pruning it should
        # return those pages to the OS so the size cap recovers.
        room_id = room_key = "bigroomcode1"
        websocket = FakeWebSocket()
        await self.relay.join(
            websocket,
            {
                "type": "join",
                "roomId": room_id,
                "roomKey": room_key,
                "actorId": "actor-a",
                "seedSnapshot": {
                    "state": {
                        "collectedLocationIds": [f"LOC_{i:05d}" for i in range(3000)],
                    },
                },
            },
        )
        await self.relay.disconnect(self.relay.rooms.get(room_id), websocket)
        pages_with_room = self.relay.db.execute("PRAGMA page_count").fetchone()[0]

        self.relay.db.execute(
            "UPDATE rooms SET updated_at_ms = 0 WHERE room_id = ?",
            (room_id,),
        )
        self.relay.db.commit()
        removed = await self.relay.prune_idle_rooms()

        self.assertEqual(removed, 1)
        # incremental_vacuum returned the freed pages to the OS: nothing is left
        # stranded on the freelist and the file actually shrank.
        self.assertEqual(self.relay.db.execute("PRAGMA freelist_count").fetchone()[0], 0)
        pages_after_prune = self.relay.db.execute("PRAGMA page_count").fetchone()[0]
        self.assertLess(pages_after_prune, pages_with_room)


class HealthzTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")
        self.relay = RelayServer(self.db_path)

    async def asyncTearDown(self) -> None:
        self.relay.db.close()
        self.tmpdir.cleanup()

    async def test_healthz_returns_ok(self) -> None:
        connection = MagicMock()
        connection.respond = MagicMock(return_value="sentinel")
        request = MagicMock()
        request.path = "/healthz"

        result = await self.relay.process_request(connection, request)

        self.assertEqual(result, "sentinel")
        connection.respond.assert_called_once()
        status_arg = connection.respond.call_args.args[0]
        self.assertEqual(int(status_arg), 200)

    async def test_non_healthz_path_falls_through(self) -> None:
        connection = MagicMock()
        request = MagicMock()
        request.path = "/other"

        result = await self.relay.process_request(connection, request)

        self.assertIsNone(result)
        connection.respond.assert_not_called()

    async def test_legacy_api_healthz_returns_tuple(self) -> None:
        # websockets 10.x calls process_request(path, request_headers) and wants
        # a (status, headers, body) tuple back.
        result = await self.relay.process_request("/healthz", MagicMock())

        self.assertIsInstance(result, tuple)
        status, _headers, body = result
        self.assertEqual(int(status), 200)
        self.assertEqual(body, b"ok\n")

    async def test_legacy_api_non_healthz_falls_through(self) -> None:
        result = await self.relay.process_request("/coop/ws", MagicMock())
        self.assertIsNone(result)

    async def test_rooms_new_endpoint_is_gone(self) -> None:
        connection = MagicMock()
        request = MagicMock()
        request.path = "/rooms/new"

        result = await self.relay.process_request(connection, request)

        self.assertIsNone(result)
        connection.respond.assert_not_called()


class RssGateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")

    async def asyncTearDown(self) -> None:
        self.tmpdir.cleanup()

    def _fake_request(self, path: str = "/coop/ws"):
        connection = MagicMock()
        connection.respond = MagicMock(return_value="sentinel")
        request = MagicMock()
        request.path = path
        return connection, request

    async def test_gate_disabled_by_default(self) -> None:
        relay = RelayServer(self.db_path)
        try:
            connection, request = self._fake_request()
            with patch("server.relay.current_rss_bytes", return_value=10**12):
                result = await relay.process_request(connection, request)
            self.assertIsNone(result)
            connection.respond.assert_not_called()
        finally:
            relay.db.close()

    async def test_refuses_new_connection_when_over_limit(self) -> None:
        relay = RelayServer(self.db_path, max_rss_bytes=100)
        try:
            connection, request = self._fake_request()
            with patch("server.relay.current_rss_bytes", return_value=200):
                result = await relay.process_request(connection, request)
            self.assertEqual(result, "sentinel")
            connection.respond.assert_called_once()
            status_arg = connection.respond.call_args.args[0]
            self.assertEqual(int(status_arg), 503)
        finally:
            relay.db.close()

    async def test_allows_new_connection_when_under_limit(self) -> None:
        relay = RelayServer(self.db_path, max_rss_bytes=1000)
        try:
            connection, request = self._fake_request()
            with patch("server.relay.current_rss_bytes", return_value=200):
                result = await relay.process_request(connection, request)
            self.assertIsNone(result)
            connection.respond.assert_not_called()
        finally:
            relay.db.close()

    async def test_healthz_served_even_when_over_limit(self) -> None:
        relay = RelayServer(self.db_path, max_rss_bytes=100)
        try:
            connection, request = self._fake_request(path="/healthz")
            with patch("server.relay.current_rss_bytes", return_value=10**9):
                result = await relay.process_request(connection, request)
            self.assertEqual(result, "sentinel")
            status_arg = connection.respond.call_args.args[0]
            self.assertEqual(int(status_arg), 200)
        finally:
            relay.db.close()

    async def test_negative_limit_is_treated_as_disabled(self) -> None:
        relay = RelayServer(self.db_path, max_rss_bytes=-1)
        self.assertEqual(relay.max_rss_bytes, 0)
        try:
            connection, request = self._fake_request()
            with patch("server.relay.current_rss_bytes", return_value=10**12):
                result = await relay.process_request(connection, request)
            self.assertIsNone(result)
        finally:
            relay.db.close()

    async def test_legacy_api_refuses_when_over_limit(self) -> None:
        # websockets 10.x: (path, request_headers) in, (status, headers, body) out.
        relay = RelayServer(self.db_path, max_rss_bytes=100)
        try:
            with patch("server.relay.current_rss_bytes", return_value=200):
                result = await relay.process_request("/coop/ws", MagicMock())
            self.assertIsInstance(result, tuple)
            status, _headers, body = result
            self.assertEqual(int(status), 503)
            self.assertEqual(body, b"server at capacity\n")
        finally:
            relay.db.close()

    async def test_legacy_api_allows_when_under_limit(self) -> None:
        relay = RelayServer(self.db_path, max_rss_bytes=1000)
        try:
            with patch("server.relay.current_rss_bytes", return_value=200):
                result = await relay.process_request("/coop/ws", MagicMock())
            self.assertIsNone(result)
        finally:
            relay.db.close()

    def test_current_rss_bytes_is_nonnegative_int(self) -> None:
        value = current_rss_bytes()
        self.assertIsInstance(value, int)
        self.assertGreaterEqual(value, 0)


class SoftRssGateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")
        self.room_id = "softgateroom01"
        self.room_key = "softgatekey001"

    async def asyncTearDown(self) -> None:
        self.tmpdir.cleanup()

    async def test_soft_gate_disabled_by_default(self) -> None:
        relay = RelayServer(self.db_path)
        try:
            with patch("server.relay.current_rss_bytes", return_value=10**12):
                room = await relay.get_room(self.room_id, self.room_key)
            self.assertEqual(room.room_id, self.room_id)
        finally:
            relay.db.close()

    async def test_refuses_new_room_when_over_soft_limit(self) -> None:
        relay = RelayServer(self.db_path, soft_max_rss_bytes=100)
        try:
            with patch("server.relay.current_rss_bytes", return_value=200):
                with self.assertRaises(ProtocolError) as cm:
                    await relay.get_room(self.room_id, self.room_key)
            self.assertIn("no new rooms", str(cm.exception))
            # Nothing was materialized or persisted.
            self.assertNotIn(self.room_id, relay.rooms)
            row = relay.db.execute(
                "SELECT 1 FROM rooms WHERE room_id = ?", (self.room_id,)
            ).fetchone()
            self.assertIsNone(row)
        finally:
            relay.db.close()

    async def test_allows_new_room_when_under_soft_limit(self) -> None:
        relay = RelayServer(self.db_path, soft_max_rss_bytes=1000)
        try:
            with patch("server.relay.current_rss_bytes", return_value=200):
                room = await relay.get_room(self.room_id, self.room_key)
            self.assertEqual(room.room_id, self.room_id)
        finally:
            relay.db.close()

    async def test_allows_join_to_resident_room_when_over_soft_limit(self) -> None:
        relay = RelayServer(self.db_path, soft_max_rss_bytes=100)
        try:
            # Materialize the room while memory is low, then cross the ceiling.
            with patch("server.relay.current_rss_bytes", return_value=50):
                first = await relay.get_room(self.room_id, self.room_key)
            with patch("server.relay.current_rss_bytes", return_value=200):
                again = await relay.get_room(self.room_id, self.room_key)
            # A join to the already-resident room is served, not refused.
            self.assertIs(again, first)
        finally:
            relay.db.close()

    async def test_refuses_reload_of_evicted_room_when_over_soft_limit(self) -> None:
        relay = RelayServer(self.db_path, soft_max_rss_bytes=100)
        try:
            with patch("server.relay.current_rss_bytes", return_value=50):
                await relay.get_room(self.room_id, self.room_key)
            # Simulate empty-room eviction: the row stays in SQLite, so the next
            # join would reload it -- which the soft gate must also refuse.
            relay.rooms.pop(self.room_id)
            with patch("server.relay.current_rss_bytes", return_value=200):
                with self.assertRaises(ProtocolError) as cm:
                    await relay.get_room(self.room_id, self.room_key)
            self.assertIn("no new rooms", str(cm.exception))
        finally:
            relay.db.close()

    async def test_negative_soft_limit_is_treated_as_disabled(self) -> None:
        relay = RelayServer(self.db_path, soft_max_rss_bytes=-1)
        self.assertEqual(relay.soft_max_rss_bytes, 0)
        try:
            with patch("server.relay.current_rss_bytes", return_value=10**12):
                room = await relay.get_room(self.room_id, self.room_key)
            self.assertEqual(room.room_id, self.room_id)
        finally:
            relay.db.close()

    async def test_warns_when_soft_limit_not_below_hard(self) -> None:
        # A soft ceiling >= the hard one can never fire (the hard gate refuses the
        # socket first), so construction warns about the dead configuration.
        with self.assertLogs("tlt.sync_relay", level="WARNING") as logs:
            relay = RelayServer(
                self.db_path, max_rss_bytes=100, soft_max_rss_bytes=100
            )
        relay.db.close()
        self.assertTrue(
            any("never fires" in message for message in logs.output),
            logs.output,
        )


class RoomCreationLimitTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")

    async def asyncTearDown(self) -> None:
        self.tmpdir.cleanup()

    async def _join_new_room(self, relay: RelayServer, suffix: str) -> None:
        room_code = f"roomcode{suffix}"
        await relay.join(
            FakeWebSocket(),
            {
                "type": "join",
                "roomId": room_code,
                "roomKey": room_code,
                "actorId": "actor-a",
            },
        )

    async def test_rate_limit_blocks_creation_past_ceiling(self) -> None:
        relay = RelayServer(self.db_path, max_new_rooms_per_minute=2)
        try:
            await self._join_new_room(relay, "001")
            await self._join_new_room(relay, "002")
            with self.assertRaises(ProtocolError) as cm:
                await self._join_new_room(relay, "003")
            self.assertIn("rate limit", str(cm.exception))
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()

    async def test_rate_limit_does_not_block_joins_to_existing_rooms(self) -> None:
        relay = RelayServer(self.db_path, max_new_rooms_per_minute=1)
        try:
            await self._join_new_room(relay, "001")
            # Re-joining the same room is not a creation, so it must not be
            # rate-limited even though the per-minute budget is spent.
            for _ in range(5):
                await self._join_new_room(relay, "001")
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()

    async def test_rate_limit_window_slides(self) -> None:
        relay = RelayServer(self.db_path, max_new_rooms_per_minute=1)
        try:
            await self._join_new_room(relay, "001")
            with self.assertRaises(ProtocolError):
                await self._join_new_room(relay, "002")
            # Age the recorded creation out of the rolling window.
            relay._recent_room_creations[0] -= ROOM_CREATION_WINDOW_MS + 1
            await self._join_new_room(relay, "003")
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()

    async def test_storage_limit_blocks_creation(self) -> None:
        # Any existing room already pushes the db past a 0-byte ceiling.
        relay = RelayServer(self.db_path, max_db_bytes=0)
        try:
            with self.assertRaises(ProtocolError) as cm:
                await self._join_new_room(relay, "001")
            self.assertIn("storage is full", str(cm.exception))
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()

    async def test_per_room_client_cap_blocks_extra_joins(self) -> None:
        relay = RelayServer(self.db_path, max_clients_per_room=2)
        code = "sharedroom1"
        try:
            for actor in ("a", "b"):
                await relay.join(
                    FakeWebSocket(),
                    {
                        "type": "join",
                        "roomId": code,
                        "roomKey": code,
                        "actorId": f"actor-{actor}",
                    },
                )
            with self.assertRaises(ProtocolError) as cm:
                await relay.join(
                    FakeWebSocket(),
                    {
                        "type": "join",
                        "roomId": code,
                        "roomKey": code,
                        "actorId": "actor-c",
                    },
                )
            self.assertIn("full", str(cm.exception))
        finally:
            await _cancel_sender_tasks(relay)
            relay.db.close()


if __name__ == "__main__":
    unittest.main()
