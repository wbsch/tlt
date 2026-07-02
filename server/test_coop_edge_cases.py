"""Regression tests from the coop-protocol soundness audit.

The relay is a total-order, last-writer-wins reducer. Granular ops merge fine,
but coarse "replace the whole collection" ops (`locations.set_ids`,
`inventory.set_full`, `settings.apply`, ...) clobber any concurrent edit a peer
made to the same collection. `locations.set_ids` is *meant* to be a whole-list
replace, so the fix is on the client: additive UI actions like "mark all
reachable" now emit granular `locations.set_collected` ops instead of a
`set_ids` replace. This test pins the relay-side half of that contract — granular
collects from concurrent actors merge, so a peer's collect survives.

Run: python3 -m unittest server.test_coop_edge_cases
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from server.relay import RelayServer
from server.testutil import FakeWebSocket, cancel_sender_tasks


class CoopLostUpdateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "test-sync.db")
        self.relay = RelayServer(self.db_path, idle_prune_days=7.0)
        self.room_id = "coopedgeroom"
        self.room_key = "coopedgekey0"
        # Materialize the room the same way a first join would (auto-create).
        await self.relay.get_room(self.room_id, self.room_key)

    async def asyncTearDown(self) -> None:
        await cancel_sender_tasks(self.relay)
        self.relay.db.close()
        self.tmpdir.cleanup()

    async def _connect(self, actor_id: str) -> FakeWebSocket:
        websocket = FakeWebSocket()
        await self.relay.join(
            websocket,
            {
                "type": "join",
                "roomId": self.room_id,
                "roomKey": self.room_key,
                "actorId": actor_id,
            },
        )
        return websocket

    def _envelope(self, actor_id: str, op_id: str, op: dict) -> dict:
        return {
            "protocolSchema": 1,
            "sessionId": self.room_id,
            "opId": op_id,
            "actorId": actor_id,
            "clientClock": 1,
            "ts": 1000,
            "op": op,
        }

    async def test_mark_all_reachable_collects_merge_with_concurrent_collect(
        self,
    ) -> None:
        a = await self._connect("actor-a")
        b = await self._connect("actor-b")
        room = self.relay.rooms[self.room_id]

        # B collects a location (granular op).
        await self.relay.handle_operation(
            room,
            b,
            self._envelope(
                "actor-b",
                "op-b-collect",
                {
                    "type": "locations.set_collected",
                    "locationId": "LOC_B_PICKUP",
                    "collected": True,
                },
            ),
        )

        # A, who had not yet received B's collect, marks a whole region reachable.
        # The fixed client emits this additively — one granular collect per
        # newly-collected location — never a `locations.set_ids` replace, so it
        # merges with B's concurrent collect instead of clobbering it.
        for op_id, location_id in (
            ("op-a-collect-1", "LOC_A_ONE"),
            ("op-a-collect-2", "LOC_A_TWO"),
        ):
            await self.relay.handle_operation(
                room,
                a,
                self._envelope(
                    "actor-a",
                    op_id,
                    {
                        "type": "locations.set_collected",
                        "locationId": location_id,
                        "collected": True,
                    },
                ),
            )

        snapshot = json.loads(
            self.relay.db.execute(
                "SELECT snapshot_json FROM rooms WHERE room_id = ?",
                (self.room_id,),
            ).fetchone()["snapshot_json"]
        )
        collected = snapshot["state"]["collectedLocationIds"]

        # All three survive: B's collect is not clobbered by A's region mark.
        self.assertIn("LOC_B_PICKUP", collected)
        self.assertIn("LOC_A_ONE", collected)
        self.assertIn("LOC_A_TWO", collected)


if __name__ == "__main__":
    unittest.main()
