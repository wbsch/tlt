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
    OP_TYPES,
    ProtocolError,
    RelayServer,
    ROOM_CREATION_WINDOW_MS,
    current_rss_bytes,
    normalize_join_message,
    normalize_operation,
)
from server.testutil import FakeWebSocket, cancel_sender_tasks


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
        await cancel_sender_tasks(self.relay)
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

    def test_op_type_in_op_types_without_validator_is_rejected(self) -> None:
        # Pins the normalize_operation fallback: an op type present in OP_TYPES
        # but missing a validator branch (a dev mistake, unreachable today) must
        # raise a contained ProtocolError — rejecting that one op/connection,
        # never crashing the server — instead of silently accepting a
        # payload-less op that reduce_snapshot would no-op.
        with patch("server.relay.OP_TYPES", OP_TYPES | {"bogus.new_op"}):
            with self.assertRaises(ProtocolError) as cm:
                normalize_operation({"type": "bogus.new_op"})
        self.assertIn("no validator", str(cm.exception))

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
        # Ops without a `mutationId` are not deduped: they are all absolute
        # set/replace ops, so reapplying a duplicate must leave the state
        # identical to applying it once. (That idempotency is what makes it safe
        # for a pre-mutationId client to have no dedup.)
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

    def _envelope(
        self,
        op: dict,
        *,
        op_id: str = "op-1",
        actor_id: str = "actor-a",
        mutation_id: str | None = None,
    ) -> dict:
        envelope = {
            "protocolSchema": 1,
            "sessionId": self.room_id,
            "opId": op_id,
            "actorId": actor_id,
            "clientClock": 1,
            "ts": 1000,
            "op": op,
        }
        if mutation_id is not None:
            envelope["mutationId"] = mutation_id
        return envelope

    async def _apply(self, websocket, op: dict, **kwargs) -> None:
        room = self.relay.rooms[self.room_id]
        await self.relay.handle_operation(room, websocket, self._envelope(op, **kwargs))

    async def _stored_state(self) -> dict:
        row = self.relay.db.execute(
            "SELECT snapshot_json FROM rooms WHERE room_id = ?",
            (self.room_id,),
        ).fetchone()
        return json.loads(row["snapshot_json"])["state"]

    async def test_spoiler_and_hint_ops_land_in_the_room_snapshot(self) -> None:
        websocket, _, _ = await self.connect()
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": True,
                "ootmmVersion": "32.2",
                "hintsText": "WOTH: Kokiri Forest",
            },
        )
        await self._apply(
            websocket,
            {"type": "session.set_spoiler_fish_ids", "ids": ["OOT_FISH", "MM_FISH"]},
        )
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_placements",
                "placements": [
                    {
                        "itemId": "OOT_HOOKSHOT",
                        "itemName": "Hookshot",
                        "locationId": "OOT_DMT_CHEST",
                        "locationName": "DMT Chest",
                        "world": 0,
                    }
                ],
            },
        )
        await self._apply(
            websocket,
            {
                "type": "hints.path.add",
                "hint": {"region": "OOT_KOKIRI_FOREST", "subType": "woth"},
            },
        )
        await self._apply(
            websocket,
            {
                "type": "hints.region.add",
                "hint": {"region": "MM_GREAT_BAY", "itemId": "MM_HOOKSHOT"},
            },
        )
        await self._apply(
            websocket,
            {"type": "hints.protected_location_ids.set", "ids": ["OOT_DMT_CHEST"]},
        )

        state = await self._stored_state()
        self.assertTrue(state["hasImportedSpoilerLog"])
        self.assertEqual(state["importedSpoilerLogVersion"], "32.2")
        self.assertEqual(state["hintsText"], "WOTH: Kokiri Forest")
        # Ids are stored as a sorted set, so transmission order doesn't matter.
        self.assertEqual(state["spoilerFishItemIds"], ["OOT_FISH", "MM_FISH"])
        self.assertEqual(len(state["spoilerPlacements"]), 1)
        self.assertEqual(state["spoilerPlacements"][0]["itemName"], "Hookshot")
        self.assertEqual(
            state["hintTracker"]["pathHints"],
            [{"region": "OOT_KOKIRI_FOREST", "subType": "woth"}],
        )
        self.assertEqual(
            state["hintTracker"]["regionHints"],
            [{"region": "MM_GREAT_BAY", "itemId": "MM_HOOKSHOT"}],
        )
        self.assertEqual(state["hintProtectedLocationIds"], ["OOT_DMT_CHEST"])

        # A peer joining later receives all of it in the seed snapshot.
        _, _, snapshot = await self.connect(actor_id="actor-b")
        peer_state = snapshot["snapshotEnvelope"]["state"]
        self.assertEqual(peer_state["hintsText"], "WOTH: Kokiri Forest")
        self.assertEqual(len(peer_state["hintTracker"]["pathHints"]), 1)
        self.assertEqual(len(peer_state["spoilerPlacements"]), 1)

    async def test_hint_removes_are_index_addressed_and_preserve_order(self) -> None:
        websocket, _, _ = await self.connect()
        for region in ("REGION_A", "REGION_B", "REGION_C"):
            await self._apply(
                websocket,
                {"type": "hints.foolish.add", "hint": {"region": region}},
            )
        # Remove the middle entry: order must be preserved, not sorted.
        await self._apply(websocket, {"type": "hints.foolish.remove", "index": 1})

        state = await self._stored_state()
        self.assertEqual(
            [hint["region"] for hint in state["hintTracker"]["foolishHints"]],
            ["REGION_A", "REGION_C"],
        )

        # An out-of-range index is ignored rather than fatal, so a stale peer
        # index can't brick the room.
        await self._apply(websocket, {"type": "hints.foolish.remove", "index": 99})
        state = await self._stored_state()
        self.assertEqual(len(state["hintTracker"]["foolishHints"]), 2)

    async def test_duplicate_mutation_id_is_applied_exactly_once(self) -> None:
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        add_op = {
            "type": "hints.path.add",
            "hint": {"region": "REGION_A", "subType": "woth"},
        }
        await self.relay.handle_operation(
            room, websocket, self._envelope(add_op, mutation_id="mutation-1")
        )
        # The same logical mutation replayed after a reconnect: new wire opId,
        # same mutationId.
        await self.relay.handle_operation(
            room,
            websocket,
            self._envelope(add_op, op_id="op-2", mutation_id="mutation-1"),
        )
        await self._drain_room()

        state = await self._stored_state()
        self.assertEqual(
            len(state["hintTracker"]["pathHints"]),
            1,
            "a replayed mutation must not be applied twice",
        )
        row = self.relay.db.execute(
            "SELECT latest_seq FROM rooms WHERE room_id = ?",
            (self.room_id,),
        ).fetchone()
        self.assertEqual(row["latest_seq"], 1, "the duplicate must not commit")
        # The duplicate is still echoed back to the sender: that echo is the ack
        # the client waits on before dropping the op from its replay queue.
        op_events = [
            json.loads(msg)
            for msg in websocket.sent
            if json.loads(msg).get("type") == "op"
        ]
        self.assertEqual([e["envelope"]["opId"] for e in op_events], ["op-1", "op-2"])

    async def test_duplicate_mutation_id_is_acked_but_not_rebroadcast(self) -> None:
        first, _, _ = await self.connect(actor_id="actor-a")
        second, _, _ = await self.connect(actor_id="actor-b")
        room = self.relay.rooms[self.room_id]
        op = {"type": "hints.moon.add", "hint": {"region": "R", "itemId": "I"}}
        await self.relay.handle_operation(
            room, first, self._envelope(op, mutation_id="m1")
        )
        # Let the first broadcast reach both peers before clearing, so only the
        # duplicate's fan-out is under test.
        await self._drain_room()
        second.sent.clear()
        await self.relay.handle_operation(
            room, first, self._envelope(op, op_id="op-dup", mutation_id="m1")
        )
        await self._drain_room()

        # A peer must not receive the duplicate: it would apply the delta again.
        peer_ops = [
            json.loads(msg)
            for msg in second.sent
            if json.loads(msg).get("type") == "op"
        ]
        self.assertEqual(peer_ops, [])
        state = await self._stored_state()
        self.assertEqual(len(state["hintTracker"]["moonHints"]), 1)

    async def test_seen_mutation_ids_survive_a_relay_restart(self) -> None:
        websocket, _, _ = await self.connect()
        room = self.relay.rooms[self.room_id]
        op = {"type": "hints.region.add", "hint": {"region": "R", "itemId": "I"}}
        await self.relay.handle_operation(
            room, websocket, self._envelope(op, mutation_id="persisted-1")
        )
        await self._drain_room()
        await cancel_sender_tasks(self.relay)

        # A fresh server over the same database must still recognise the
        # mutation, or a client reconnecting after a relay restart would replay
        # the op into a room that already has it.
        restarted = RelayServer(self.db_path, idle_prune_days=7.0)
        try:
            room = await restarted.get_room(self.room_id, self.room_key)
            self.assertEqual(room.seen_mutation_ids, ["persisted-1"])
            websocket2 = FakeWebSocket()
            await restarted.join(
                websocket2,
                {
                    "type": "join",
                    "roomId": self.room_id,
                    "roomKey": self.room_key,
                    "actorId": "actor-a",
                },
            )
            await restarted.handle_operation(
                room,
                websocket2,
                self._envelope(op, op_id="op-2", mutation_id="persisted-1"),
            )
            row = restarted.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()
            state = json.loads(row["snapshot_json"])["state"]
            self.assertEqual(len(state["hintTracker"]["regionHints"]), 1)
            await cancel_sender_tasks(restarted)
        finally:
            restarted.db.close()

    async def test_dropping_the_spoiler_import_clears_hint_text(self) -> None:
        websocket, _, _ = await self.connect()
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": True,
                "ootmmVersion": "32.2",
                "hintsText": "some hints",
            },
        )
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": False,
                "ootmmVersion": None,
            },
        )
        state = await self._stored_state()
        self.assertFalse(state["hasImportedSpoilerLog"])
        self.assertIsNone(state["hintsText"])

    async def test_spoiler_log_state_without_hints_text_keeps_existing_text(self) -> None:
        websocket, _, _ = await self.connect()
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": True,
                "ootmmVersion": "32.2",
                "hintsText": "some hints",
            },
        )
        # A client that predates hintsText omits the key entirely.
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": True,
                "ootmmVersion": "32.2",
            },
        )
        state = await self._stored_state()
        self.assertEqual(state["hintsText"], "some hints")

    async def test_large_hint_text_is_accepted(self) -> None:
        # A full spoiler log's `hintsText` is ~10k chars: it must be bounded by
        # MAX_JSON_STRING_LENGTH, not the MAX_ID_LENGTH identifier cap.
        websocket, _, _ = await self.connect()
        hints_text = "WOTH: somewhere\n" * 800
        self.assertGreater(len(hints_text), 256)
        await self._apply(
            websocket,
            {
                "type": "session.set_spoiler_log_state",
                "imported": True,
                "ootmmVersion": "32.2",
                "hintsText": hints_text,
            },
        )
        state = await self._stored_state()
        self.assertEqual(state["hintsText"], hints_text)

    async def test_seed_snapshot_with_large_hint_text_is_accepted(self) -> None:
        # The join seed carries the host's hint text, so the same cap applies
        # there. (Found in the browser: the seed was rejected with
        # "seed.hintsText is too long" and the coop session never connected.)
        hints_text = "region hint line\n" * 800
        json_bytes = json.dumps({"hintsText": hints_text})
        self.assertGreater(len(hints_text), 256)
        room_id = "seedbigtext"
        message = normalize_join_message(
            {
                "type": "join",
                "roomId": room_id,
                "roomKey": self.room_key,
                "actorId": "actor-a",
                "snapshotEnvelope": {
                    "state": {
                        "hasImportedSpoilerLog": True,
                        "hintsText": hints_text,
                    }
                },
            }
        )
        room = self.relay._get_or_create_room_locked(
            room_id,
            self.room_key,
            seed_snapshot=message["seedSnapshot"],
        )
        self.assertEqual(room.snapshot_envelope["state"]["hintsText"], hints_text)
        # Sanity check that this is not simply an unbounded pass-through.
        self.assertLess(len(json_bytes), MAX_SNAPSHOT_BYTES)

    async def test_hint_text_beyond_the_json_string_cap_is_rejected(self) -> None:
        # Something far past a real spoiler log's hint text is still refused.
        # (Validation lives in normalize_operation, not handle_operation.)
        oversized = "x" * (256 * 1024 + 1)
        with self.assertRaises(ProtocolError) as cm:
            normalize_operation(
                {
                    "type": "session.set_spoiler_log_state",
                    "imported": True,
                    "ootmmVersion": "32.2",
                    "hintsText": oversized,
                }
            )
        self.assertIn("too long", str(cm.exception))

    def test_hint_and_spoiler_validators_reject_malformed_payloads(self) -> None:
        cases = [
            ({"type": "hints.path.add", "hint": {"region": "R"}}, "missing required keys"),
            (
                {"type": "hints.path.add", "hint": {"region": "R", "subType": "nonsense"}},
                "subType is unknown",
            ),
            (
                {
                    "type": "hints.path.add",
                    "hint": {"region": "R", "subType": "woth", "extra": 1},
                },
                "unexpected keys",
            ),
            ({"type": "hints.region.add", "hint": {"region": "R"}}, "missing required keys"),
            ({"type": "hints.path.remove", "index": -1}, "non-negative"),
            ({"type": "hints.set_full", "state": {"pathHints": []}}, "missing required keys"),
            (
                {"type": "session.set_spoiler_fish_ids", "ids": ["ok", 5]},
                "must be a string",
            ),
            ({"type": "session.set_spoiler_placements", "placements": {}}, "must be an array"),
            (
                {"type": "session.set_spoiler_placements", "placements": [{"itemId": "I"}]},
                "missing required keys",
            ),
            (
                {
                    "type": "session.set_spoiler_log_state",
                    "imported": "yes",
                    "ootmmVersion": None,
                },
                "imported must be a boolean",
            ),
        ]
        for operation, expected in cases:
            with self.subTest(operation=operation):
                with self.assertRaises(ProtocolError) as cm:
                    normalize_operation(operation)
                self.assertIn(expected, str(cm.exception))

    def test_every_client_op_type_has_a_validator(self) -> None:
        # Mirrors the op union in packs/ootmm/src/stores/ootmmSessionSync.ts,
        # minus `session.reset_defaults` (the client leaves the room instead of
        # sending a reset op). A type listed in OP_TYPES without a validator
        # branch would be rejected at runtime by normalize_operation.
        payloads = {
            "inventory.set_full": {"inventoryById": {}},
            "inventory.set_count": {"itemId": "I", "count": 1},
            "locations.set_collected": {"locationId": "L", "collected": True},
            "locations.set_ids": {"ids": []},
            "locations.set_junk_ids": {"ids": []},
            "world.set_precompleted": {"ids": []},
            "world.set_song_events": {"events": {}},
            "world.set_shop_prices": {"prices": {}},
            "world.set_shop_price": {"locationId": "L", "price": 5},
            "world.set_entrance_override": {"src": "A", "dst": "B"},
            "world.set_entrance_overrides": {"overrides": {}},
            "settings.apply": {"settings": {}},
            "settings.patch_special_conds": {"patch": {}},
            "session.set_spoiler_log_state": {"imported": True, "ootmmVersion": None},
            "session.set_spoiler_fish_ids": {"ids": []},
            "session.set_spoiler_placements": {"placements": []},
            "hints.path.add": {"hint": {"region": "R", "subType": "woth"}},
            "hints.path.remove": {"index": 0},
            "hints.always-sometimes.add": {"hint": {"location": "L", "itemId": "I"}},
            "hints.always-sometimes.remove": {"index": 0},
            "hints.region.add": {"hint": {"region": "R", "itemId": "I"}},
            "hints.region.remove": {"index": 0},
            "hints.foolish.add": {"hint": {"region": "R"}},
            "hints.foolish.remove": {"index": 0},
            "hints.moon.add": {"hint": {"region": "R", "itemId": "I"}},
            "hints.moon.remove": {"index": 0},
            "hints.set_full": {
                "state": {
                    "pathHints": [],
                    "alwaysSometimesHints": [],
                    "regionHints": [],
                    "foolishHints": [],
                    "moonHints": [],
                }
            },
            "hints.protected_location_ids.set": {"ids": []},
        }
        self.assertEqual(sorted(payloads), sorted(OP_TYPES))
        for op_type in sorted(OP_TYPES):
            with self.subTest(op_type=op_type):
                normalize_operation({"type": op_type, **payloads[op_type]})

    def test_seed_snapshot_carries_spoiler_and_hint_state(self) -> None:
        # A fresh room id: the room materialized in asyncSetUp already exists and
        # a seed only applies at creation time.
        room_id = "seededroom"
        seed = {
            "state": {
                "hasImportedSpoilerLog": True,
                "importedSpoilerLogVersion": "32.2",
                "hintsText": "hint text",
                "spoilerPlacements": [
                    {
                        "itemId": "OOT_HOOKSHOT",
                        "itemName": "Hookshot",
                        "locationId": "OOT_DMT_CHEST",
                        "locationName": "DMT Chest",
                    }
                ],
                "hintTracker": {
                    "pathHints": [{"region": "R", "subType": "woth"}],
                    "alwaysSometimesHints": [],
                    "regionHints": [],
                    "foolishHints": [],
                    "moonHints": [],
                },
                "hintProtectedLocationIds": ["OOT_DMT_CHEST"],
            }
        }
        message = normalize_join_message(
            {
                "type": "join",
                "roomId": room_id,
                "roomKey": self.room_key,
                "actorId": "actor-a",
                "snapshotEnvelope": seed,
            }
        )
        room = self.relay._get_or_create_room_locked(
            room_id,
            self.room_key,
            seed_snapshot=message["seedSnapshot"],
        )
        state = room.snapshot_envelope["state"]
        self.assertEqual(state["hintsText"], "hint text")
        self.assertEqual(len(state["spoilerPlacements"]), 1)
        self.assertEqual(len(state["hintTracker"]["pathHints"]), 1)
        self.assertEqual(state["hintProtectedLocationIds"], ["OOT_DMT_CHEST"])

    async def test_seed_snapshot_without_spoiler_import_drops_hint_text(self) -> None:
        room_id = "seednospoiler"
        room = self.relay._get_or_create_room_locked(
            room_id,
            self.room_key,
            seed_snapshot={
                "state": {
                    "hasImportedSpoilerLog": False,
                    "hintsText": "text that has no import to belong to",
                }
            },
        )
        state = room.snapshot_envelope["state"]
        self.assertFalse(state["hasImportedSpoilerLog"])
        self.assertIsNone(state["hintsText"])

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
        await cancel_sender_tasks(self.relay)
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
            await cancel_sender_tasks(relay)
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
            await cancel_sender_tasks(relay)
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
            await cancel_sender_tasks(relay)
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
            await cancel_sender_tasks(relay)
            relay.db.close()

    async def test_storage_limit_blocks_creation(self) -> None:
        # Any existing room already pushes the db past a 0-byte ceiling.
        relay = RelayServer(self.db_path, max_db_bytes=0)
        try:
            with self.assertRaises(ProtocolError) as cm:
                await self._join_new_room(relay, "001")
            self.assertIn("storage is full", str(cm.exception))
        finally:
            await cancel_sender_tasks(relay)
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
            await cancel_sender_tasks(relay)
            relay.db.close()


if __name__ == "__main__":
    unittest.main()
