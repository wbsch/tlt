"""Shared scaffolding for the server test modules.

Named so the ``test_*.py`` discovery pattern never collects it as a test.
"""

from __future__ import annotations

import asyncio

from server.relay import RelayServer


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


async def cancel_sender_tasks(relay: RelayServer) -> None:
    for room in list(relay.rooms.values()):
        for client in list(room.clients.values()):
            task = client.sender_task
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
