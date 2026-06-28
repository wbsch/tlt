# TLT Coop Sync Relay

A minimal Python WebSocket relay so two or more browsers can share one tracker
session in real time. One process, one SQLite database, one snapshot per room.

The protocol is the same operation envelope used by the in-browser cross-tab
sync (see `packs/ootmm/src/stores/ootmmSessionSync.ts`) — the server validates,
orders, persists, and rebroadcasts.

## Install

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r server/requirements.txt
```

## Run

```bash
python3 server/relay.py \
  --host 127.0.0.1 --port 8765 \
  --db server/sync.db \
  --allow-origin http://localhost:5173 \
  --idle-prune-days 7
```

Flags:

- `--host`, `--port` — bind address
- `--db` — SQLite file (created on first run)
- `--allow-origin` — Origin allowlist; repeat for multiple. **Required** — the
  relay refuses to start without at least one origin.
- `--idle-prune-days N` — delete rooms with no activity for N days (default 7,
  set to `0` to disable). Pruning runs every 6 hours while the relay is up.
- `--log-level` — `DEBUG`/`INFO`/`WARNING`/`ERROR`

The relay serves one plain HTTP endpoint:

- `GET /healthz` → `200 ok`

## Wire protocol

Rooms are created on first join: joining an alphanumeric `roomId` that doesn't
exist yet **auto-creates** it, storing the alphanumeric `roomKey` the first
client presented. The browser client generates one 8-char code and presents it
as both `roomId` and `roomKey`. Room codes must be alphanumeric and at least 8
characters; shorter codes are rejected.

The first client message on each connection must be:

```json
{
  "type": "join",
  "roomId": "client-chosen-code",
  "roomKey": "client-chosen-code",
  "actorId": "client-abc",
  "snapshotEnvelope": { "...": "optional seed state" }
}
```

`snapshotEnvelope` is optional. When present **and** the room is brand-new, the
server validates its `state` and uses it as the room's initial document (this is
how "Start coop" uploads the host's current tracker state). For a room that
already exists the seed is ignored and the joiner adopts the stored state.

The room code (`roomKey`) is the **only** access credential. Anyone who knows
the code can read and publish ops in the room.

The server replies with:

1. `{"type":"joined", "roomId", "baselineSeq", "peerCount"}`
2. `{"type":"snapshot", "snapshotEnvelope": <current room state>}`
3. Later: `{"type":"peers", "peerCount"}` whenever the peer set changes
4. Op broadcasts: `{"type":"op", "serverSeq", "envelope": <op envelope>}`

After join, the client publishes ops:

```json
{
  "type": "op",
  "envelope": {
    "protocolSchema": 1,
    "sessionId": "room-123",
    "opId": "op-1",
    "actorId": "client-abc",
    "clientClock": 1,
    "ts": 1700000000000,
    "op": { "type": "inventory.set_count", "itemId": "OOT_BOW", "count": 1 }
  }
}
```

Op types accepted by the server must match `OoTMMSyncOperation` in
`packs/ootmm/src/stores/ootmmSessionSync.ts`. Unknown op types are rejected
with a protocol error. Note `session.reset_defaults` is intentionally **not**
accepted: resetting tracker state exits coop (the client leaves the room before
resetting), so a reset op never reaches the relay.

Duplicate `opId`s are **not** deduped server-side: every op is an absolute
set/replace, so reapplying one yields the same snapshot, and clients dedup by
`opId` themselves. (If a non-idempotent/delta op is ever added, server-side
dedup has to come back.)

## Limits

- Incoming messages are capped at `MAX_MESSAGE_BYTES` (768 KiB), large enough to
  carry a full-state seed snapshot on join.
- The stored room document is capped at `MAX_SNAPSHOT_BYTES` (512 KiB). Any op
  (or seed) that would push the room past this is rejected, so a rebroadcast
  snapshot always fits in a peer's receive buffer and a room can never grow into
  an un-joinable state.
- Total SQLite storage is capped at `MAX_DB_BYTES` (1 GiB). Past this the relay
  refuses to create **new** rooms; existing rooms keep working. Idle-room
  pruning runs `incremental_vacuum` to return freed pages to the OS, so the cap
  recovers after a spike instead of staying pinned at the high-water mark. (The
  DB is created with `auto_vacuum=INCREMENTAL`; a pre-existing `sync.db` made
  before this needs a one-time `VACUUM` to enable it.)
- New-room creation is globally rate-limited to `MAX_NEW_ROOMS_PER_MINUTE` (60)
  per rolling minute. Joins to rooms that already exist are never limited.
- A single room holds at most `MAX_CLIENTS_PER_ROOM` (16) clients; further joins
  are rejected. This bounds broadcast fan-out and per-room memory.
- A connection must send its `join` within `JOIN_TIMEOUT_SEC` (10s) of opening
  or the relay drops it, so anonymous sockets can't be held open for free.
- Room codes must be alphanumeric and at least `ROOM_CODE_MIN_LENGTH` (8)
  characters.

## Security model

- The `roomKey` is the only credential. Anyone who has it can read, publish,
  and reset ops in the room.
- `actorId` is **not** authenticated. Any client in a room can set it to any
  value in both the `join` and each op envelope, and other peers receive that
  value verbatim. Don't use `envelope.actorId` for authorization downstream.
- `--allow-origin` is enforced only for browser clients — the `websockets`
  library checks the `Origin` header, which non-browser clients (anything
  speaking the WebSocket protocol directly) can set to anything. Treat the
  Origin allowlist as anti-CSRF for browsers, not as access control.

## Nginx (TLS termination + reverse proxy)

Reuse the existing `thelasttracker.org` server block:

```nginx
location /coop/ws {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 3600s;
}

location = /coop/healthz {
    proxy_pass http://127.0.0.1:8765/healthz;
}
```

The browser connects to `wss://www.thelasttracker.org/coop/ws`; nginx
terminates TLS and forwards plain `ws://` to the relay on loopback.

## systemd unit example

```ini
[Unit]
Description=TLT coop sync relay
After=network.target

[Service]
Type=exec
WorkingDirectory=/srv/tlt
ExecStart=/srv/tlt/.venv/bin/python /srv/tlt/server/relay.py \
  --host 127.0.0.1 --port 8765 \
  --db /srv/tlt/data/sync.db \
  --allow-origin https://www.thelasttracker.org \
  --idle-prune-days 7
Restart=on-failure
User=tlt

# Cap RAM via the systemd cgroup (relay.py has no memory flag of its own).
# MemoryHigh is a soft cap: the kernel reclaims/throttles past it. MemoryMax is
# the hard cap: exceed it and the process is OOM-killed, then Restart=on-failure
# brings it back. RAM scales with concurrent active rooms (~120 KiB worst-case
# per room) plus per-connection WebSocket buffers, so this is generous headroom.
MemoryHigh=200M
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

Prefer `MemoryMax`/`MemoryHigh` over `LimitAS=`/`ulimit -v`: those cap _virtual_
address space, and Python + asyncio map far more virtual memory than they
actually use, so a VM limit triggers spurious `MemoryError`s well below real
usage. After editing the unit, reload and restart:

```bash
systemctl daemon-reload
systemctl restart tlt-relay   # use your unit's actual name
```

Watch real usage to tune the caps down:

```bash
systemctl show tlt-relay -p MemoryCurrent,MemoryPeak,MemoryMax
```

## Tests

Run all server tests (discovers every `server/test_*.py`):

```bash
python3 -m unittest discover -s server -t . -p 'test_*.py'
```

This is also wired into `npm run test:server` (and `npm run check-all`). To run a
single module:

```bash
python3 -m unittest server.test_relay
```
