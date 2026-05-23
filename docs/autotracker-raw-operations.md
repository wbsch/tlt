# Autotracker Raw Pipeline: Architecture and Operations

This document is the Phase 6 operational reference for the raw autotracker pipeline.

## Scope and Ownership

- Go autotracker (`tlt_autotracker/ootmm-autotracker`): emulator I/O, stable raw memory polling, WebSocket transport.
- TLT (`packs/ootmm/src/autotracker`): raw frame decode, state parsing, item/check extraction, tracker-state integration.
- Data files (`packs/ootmm/src/autotracker/data` + `scripts/autotracker`): schema-owned mapping and generation/validation pipeline.

No game interpretation logic should be added back into the Go WebSocket hot path.

## Runtime Architecture

1. The Go process polls emulator memory every `100ms`.
2. A stable per-poll raw snapshot (`RawFrame`) is exported as named chunks.
3. Chunks are sent via WebSocket `type: "raw"` frames.
4. The frontend (`useAutotracker`) requests `raw` mode in handshake features.
5. `createRawAutotrackerParser()` decodes chunks and computes items/checks.
6. Parsed updates are translated into tracker inventory + collected locations.

Primary implementation points:

- `tlt_autotracker/ootmm-autotracker/ws/server.go`
- `tlt_autotracker/ootmm-autotracker/ootmm/raw_frame.go`
- `packs/ootmm/src/autotracker/useAutotracker.ts`
- `packs/ootmm/src/autotracker/rawFrameParser.ts`

## WebSocket Binding and Origin Policy

The autotracker hardens browser access at the WebSocket handshake rather than through generic HTTP CORS headers.

- Default listen address: `127.0.0.1:17026`
- Default allowed browser origins:
  - `http://localhost:5173`
  - `https://www.thelasttracker.org`
- Additional origins can be configured with `-ws-allowed-origins`, using a comma-separated list of exact HTTP or HTTPS origins.
- The bind address can still be overridden with `-ws-addr` when explicit non-loopback exposure is required.
- Missing origins and `Origin: null` are rejected. If you want autotracker access in a built app, serve the files from an HTTP or HTTPS origin instead of opening them directly from disk.

Example:

```bash
./ootmm-autotracker \
  -ws-addr 127.0.0.1:17026 \
  -ws-allowed-origins http://localhost:5173,https://tracker.example.com
```

## Raw WebSocket Contract (Schema Version 1)

### Client handshake request

```json
{
  "type": "handshake",
  "features": ["raw"],
  "flags": {
    "protocol": "raw"
  }
}
```

`flags.mode` may also be used as a protocol override.

### Server handshake ack

```json
{
  "type": "handshAck",
  "version": "0.1.0",
  "name": "ootmm-autotracker",
  "refresh": true,
  "mode": "raw",
  "features": ["raw"]
}
```

### Raw frame

```json
{
  "type": "raw",
  "schemaVersion": "1",
  "diff": false,
  "refresh": true,
  "sequence": 1234,
  "game": "OoT",
  "saveIndex": 2,
  "chunks": [
    {
      "name": "oot_save_ctx",
      "address": 2148270080,
      "length": 151040,
      "data": "<base64>"
    }
  ]
}
```

Contract notes:

- `schemaVersion` must be `"1"` for the current parser.
- `diff` is currently always `false` in raw mode (full snapshot per emission).
- `sequence` is strictly increasing per server process.
- `chunks[].data` is base64 because Go JSON marshaling encodes `[]byte` as base64 text.

## Raw Frame Capture and Replay

This flow is the supported path for reproducible parser debugging.

### Capture a live frame dump

1. Run the Go autotracker.
2. In its console, run:

```text
dump my-scenario-name
```

3. This writes a snapshot JSON to:

```text
tlt_autotracker/ootmm-autotracker/memory-dumps/
```

### Add dump as replay fixture

1. Copy the snapshot to:

```text
tests/fixtures/autotracker/dumps/
```

2. Keep the filename descriptive and stable.

### Replay fixtures

Run the raw fixture smoke and transition coverage:

```bash
npm run test:unit -- tests/unit/rawFrameParser.spec.ts tests/unit/rawFrameSnapshotTransitions.spec.ts
```

## Performance Budgets

Budgets are based on current fixture-driven baseline measurements.

Current baseline (May 2026, 25 fixtures):

- Raw bytes per frame: `929,686 B`
- Estimated base64 bytes: `1,239,584 B`
- Estimated JSON payload size: `~1.24 MB`
- Parser latency (fixture replay): `p50 ~41ms`, `p95 ~50ms`, `max ~56ms`
- Poll cadence: `100ms` (`10 Hz`) in Go

Operational budgets:

- Payload size budget: target `<= 1.30 MB`, hard cap `<= 1.50 MB` per raw frame.
- Parse latency budget (browser-side parser): target `p95 <= 60ms`, hard cap `p95 <= 75ms`.
- Update frequency budget: nominal `10 Hz`; sustained effective rate should not drop below `5 Hz` during normal gameplay.

If any hard cap is exceeded, treat as regression and block rollout until investigated.

## Release and Verification Checklist

Minimum checks before shipping autotracker-related changes:

1. `npm run test:autotracker:parity`
2. `npm run test:unit`
3. `npm run build`
4. `node --import tsx scripts/pathfinder-tests/reachability_full_inventory.ts`
5. Browser check at `http://localhost:5173/?debug=1`: click **Debug: Activate All** and confirm full reachability (all checks reachable).

Additional checks for transport-security changes:

- `cd tlt_autotracker/ootmm-autotracker && go test ./...`
- Confirm a WebSocket handshake from a disallowed origin is rejected.
