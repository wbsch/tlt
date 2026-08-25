/**
 * Records the autotracker backend's raw WebSocket frames to disk so the
 * scene-transition window can be analyzed afterwards.
 *
 * The OoTMM autotracker Go backend (ws://localhost:17026/) polls emulator
 * memory every 100 ms and broadcasts a `raw` frame (base64-encoded memory
 * chunks) whenever the requested regions change. This script subscribes like
 * the tracker frontend does, then appends every frame — timestamped and with
 * the decoded play-state/save-state scene fields plus the shared custom-save
 * state — to a JSONL file.
 *
 * Usage:
 *   node --import tsx scripts/autotracker-record-raw.ts [options]
 *
 * Options:
 *   --duration <seconds>   How long to record (default 30). Use 0 to run
 *                          until Ctrl+C.
 *   --output <path>        Output JSONL file (default: raw-capture-<ts>.jsonl).
 *   --url <ws-url>         Backend URL (default ws://localhost:17026/).
 *   --live-addrs <path>    Path to live_addrs.json (auto-discovered if omitted).
 *   --help                 Print this help and exit.
 *
 * The output is one JSON object per line:
 *   {
 *     "tsMs":       wall-clock receive time (ms epoch),
 *     "recvMs":     monotonic ms since the first frame,
 *     "sequence":   backend frame sequence,
 *     "game":       "OoT" | "MM",
 *     "saveIndex":  active save slot,
 *     "diff"/"refresh": backend flags,
 *     "chunks":     [ { "name", "address", "length", "data"(base64) } ],
 *     "decoded":    { "oot"|"mm": { liveScene, room, chest, collect, ... },
 *                     "shared": { halfDays, coins, ocarinaButtonMasks, ... } }
 *   }
 *
 * The `decoded` block extracts exactly the fields that are relevant for the
 * scene-transition race: the live play-state scene id/room/flags (which update
 * immediately), for OoT the save-context scene id (which lags), and the shared
 * custom-save state (half-days, coins, ocarina button masks, song notes, ...).
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Fixed addresses & offsets (from rawFrameParser.ts + ootmm/addrs.go).
// These are NOT version-dependent: the play-state struct lives at a fixed ROM
// address; only the save-context base addresses vary per spoiler-log version
// and come from live_addrs.json.
// ---------------------------------------------------------------------------
const ADDR_OOT_PLAYSTATE = 0x801c84a0;
const ADDR_MM_PLAYSTATE = 0x803e6b20;

const OOT_PLAY_OFF_SCENE_ID = 0x00a4;
const OOT_PLAY_OFF_CURRENT_ROOM = 0x11cbc;
const OOT_PLAY_OFF_LINK_AGE_ON_LOAD = 0x11de8;
const OOT_PLAY_OFF_CHEST_FLAGS = 0x1d38;
const OOT_PLAY_OFF_COLLECT_FLAGS = 0x1d44;
const OOT_PLAY_OFF_TEMP_COLLECT = 0x1d48;

const MM_PLAY_OFF_SCENE_ID = 0x00a4;
const MM_PLAY_OFF_CURRENT_ROOM = 0x186e0;
const MM_PLAY_OFF_SWITCH0_FLAGS = 0x1e58;
const MM_PLAY_OFF_SWITCH1_FLAGS = 0x1e5c;
const MM_PLAY_OFF_CHEST_FLAGS = 0x1e68;
const MM_PLAY_OFF_COLLECT_FLAGS = 0x1e74;

const OOT_OFF_SCENE_ID = 0x66; // scene id inside the OoT save context

// Sizes (from ootmm/addrs.go — not version-dependent).
const OOT_SAVE_CTX_SIZE = 0x1450;
const MM_SAVE_CTX_SIZE = 0x48d0;

const OOT_PLAYSTATE_FLAGS_SIZE =
  OOT_PLAY_OFF_TEMP_COLLECT + 4 - OOT_PLAY_OFF_CHEST_FLAGS;
const MM_PLAYSTATE_FLAGS_SIZE =
  MM_PLAY_OFF_COLLECT_FLAGS + 4 - MM_PLAY_OFF_SWITCH0_FLAGS;

const DEFAULT_URL = 'ws://localhost:17026/';
const ORIGIN = 'http://localhost:5173';

// ---------------------------------------------------------------------------
// CLI parsing (tiny, dependency-free).
// ---------------------------------------------------------------------------
interface CliArgs {
  durationSec: number;
  output: string;
  url: string;
  liveAddrs: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    durationSec: 30,
    output: '',
    url: DEFAULT_URL,
    liveAddrs: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const [keyRaw, inlineValue] = raw.split('=');
    const key = keyRaw.replace(/^--/, '');
    const value = inlineValue ?? argv[++i];

    switch (key) {
      case 'duration':
        args.durationSec = Number(value);
        break;
      case 'output':
        args.output = value;
        break;
      case 'url':
        args.url = value;
        break;
      case 'live-addrs':
        args.liveAddrs = value;
        break;
      case 'help':
      case 'h':
        args.help = true;
        break;
      default:
        console.error(`Unknown option: ${keyRaw}`);
        process.exit(2);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`Usage: node --import tsx scripts/autotracker-record-raw.ts [options]

Options:
  --duration <seconds>   How long to record (default 30). 0 = until Ctrl+C.
  --output <path>        Output JSONL file (default: raw-capture-<ts>.jsonl).
  --url <ws-url>         Backend URL (default ${DEFAULT_URL}).
  --live-addrs <path>    Path to live_addrs.json (auto-discovered if omitted).
  --help                 Print this help and exit.

The shared custom-save chunks are built from shared_save_offsets.json and
inventory_slots.json, auto-discovered from the same version directory as
live_addrs.json.
`);
}

// ---------------------------------------------------------------------------
// live_addrs.json discovery & parsing (mirrors scripts/autotracker/*.py).
// ---------------------------------------------------------------------------
// Versioned data discovery & parsing (mirrors scripts/autotracker/*.py).
// ---------------------------------------------------------------------------
interface VersionedData {
  version: string;
  liveAddrs: LiveAddrFile;
  sharedOffsets: SharedFixedOffsets;
  sharedLayout: SharedStorageLayout;
}

function findVersionedData(explicitPath: string | null): VersionedData {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const dataDir = resolve(scriptDir, '../packs/ootmm/src/autotracker/data');

  let versionDir: string;
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`--live-addrs file not found: ${explicitPath}`);
    }
    versionDir = dirname(resolve(explicitPath));
  } else {
    const candidates: string[] = [];
    for (const entry of readdirSync(dataDir)) {
      if (existsSync(resolve(dataDir, entry, 'live_addrs.json'))) {
        candidates.push(entry);
      }
    }
    if (candidates.length === 0) {
      throw new Error(
        `No live_addrs.json found under ${dataDir}. Specify one with --live-addrs.`,
      );
    }
    candidates.sort(compareVersionDir);
    versionDir = resolve(dataDir, candidates[candidates.length - 1]);
    console.log(
      `Auto-discovered version data: ${candidates[candidates.length - 1]}`,
    );
  }

  const liveAddrs = JSON.parse(
    readFileSync(resolve(versionDir, 'live_addrs.json'), 'utf-8'),
  ) as LiveAddrFile;
  const sharedOffsets = JSON.parse(
    readFileSync(resolve(versionDir, 'shared_save_offsets.json'), 'utf-8'),
  ) as SharedFixedOffsets;
  const inventorySlots = JSON.parse(
    readFileSync(resolve(versionDir, 'inventory_slots.json'), 'utf-8'),
  ) as { catalog: { shared: SharedStorageLayout } };

  return {
    version: versionDir,
    liveAddrs,
    sharedOffsets,
    sharedLayout: inventorySlots.catalog.shared,
  };
}

function compareVersionDir(a: string, b: string): number {
  const na = versionNumbers(a);
  const nb = versionNumbers(b);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] ?? 0) - (nb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function versionNumbers(dir: string): number[] {
  const match = dir.match(/v?(\d+)(?:_(\d+))?/);
  if (!match) return [0];
  return [Number(match[1]), Number(match[2] ?? 0)];
}

interface LiveAddrFile {
  oot: { saveCtx: string; sharedCustomSaveLive: string };
  mm: { saveCtx: string; sharedCustomSaveLive: string };
}

interface SharedFixedOffsets {
  sharedCustomSaveSize: number;
  halfDaysOffset: number;
  coinsOffset: number;
  ocarinaButtonMaskOotOffset: number;
  ocarinaButtonMaskMmOffset: number;
  caughtChildFishWeightOffset: number;
  caughtAdultFishWeightOffset: number;
  caughtFishWeightCount: number;
  songNotesOffset: number;
  songNoteCount: number;
  rustyKeysOffset: number;
  rustyKeysOotSize: number;
  rustyKeysMmSize: number;
  bombchuBagFlagsOffset: number;
  songFlagsOotOffset: number;
  songFlagsMmOffset: number;
  silverRupeesOffset: number | null;
  triforceExtraRecordIndex: number;
}

interface SharedStorageLayout {
  baseOffset: number;
  stride: number;
  trackedSize: number;
  bitmaps: SharedBitmapInfo[];
}

interface SharedBitmapInfo {
  name: string;
  offset: number;
  size: number;
}

function parseHex(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 16);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid hex address for ${label}: ${raw}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Chunk spec builder. Requests the save context (coarse), the individual
// play-state fields, and the shared custom-save state, using the exact chunk
// names the frontend parser expects so the recorded frames can be replayed
// through rawFrameParser if desired.
// ---------------------------------------------------------------------------
interface ChunkSpec {
  name: string;
  address: number;
  length: number;
}

// Shared custom-save bitfield packing (from rawFrameParser.ts).
const SHARED_COIN_COUNT = 4;
const SHARED_BOMBCHU_BAG_OOT_SHIFT = 2;
const SHARED_BOMBCHU_BAG_MM_SHIFT = 0;
const SHARED_BOMBCHU_BAG_MASK = 0x3;
const SHARED_EXTRA_SWORDS_OOT_SHIFT = 4;
const SHARED_EXTRA_SWORDS_OOT_MASK = 0x3;

function buildSharedStateChunks(
  prefix: 'oot' | 'mm',
  baseAddress: number,
  layout: SharedStorageLayout,
  fo: SharedFixedOffsets,
): ChunkSpec[] {
  const specs: ChunkSpec[] = layout.bitmaps.map((bitmap) => ({
    name: `${prefix}_shared_custom_save_bitmap_${bitmap.name}`,
    address: baseAddress + bitmap.offset,
    length: bitmap.size,
  }));

  specs.push(
    {
      name: `${prefix}_shared_custom_save_half_days`,
      address: baseAddress + fo.halfDaysOffset,
      length: 1,
    },
    {
      name: `${prefix}_shared_custom_save_fish_weights`,
      address: baseAddress + fo.caughtChildFishWeightOffset,
      length:
        fo.caughtAdultFishWeightOffset +
        fo.caughtFishWeightCount -
        fo.caughtChildFishWeightOffset,
    },
    {
      name: `${prefix}_shared_custom_save_coins_and_masks`,
      address: baseAddress + fo.coinsOffset,
      length: fo.ocarinaButtonMaskMmOffset + 2 - fo.coinsOffset,
    },
    {
      name: `${prefix}_shared_custom_save_bombchu_bag_flags`,
      address: baseAddress + fo.bombchuBagFlagsOffset,
      length: 1,
    },
    {
      name: `${prefix}_shared_custom_save_song_notes`,
      address: baseAddress + fo.songNotesOffset,
      length: fo.songNoteCount,
    },
    {
      name: `${prefix}_shared_custom_save_song_flags_oot`,
      address: baseAddress + fo.songFlagsOotOffset,
      length: 2,
    },
    {
      name: `${prefix}_shared_custom_save_song_flags_mm`,
      address: baseAddress + fo.songFlagsMmOffset,
      length: 1,
    },
    {
      name: `${prefix}_shared_custom_save_rusty_keys`,
      address: baseAddress + fo.rustyKeysOffset,
      length: fo.rustyKeysOotSize + fo.rustyKeysMmSize,
    },
  );

  specs.sort((left, right) => {
    if (left.address === right.address) {
      return left.name.localeCompare(right.name);
    }
    return left.address - right.address;
  });

  return specs;
}

function buildChunks(data: VersionedData): {
  oot: ChunkSpec[];
  mm: ChunkSpec[];
} {
  const saveCtx = {
    oot: parseHex(data.liveAddrs.oot.saveCtx, 'oot.saveCtx'),
    mm: parseHex(data.liveAddrs.mm.saveCtx, 'mm.saveCtx'),
  };
  const sharedOot = parseHex(
    data.liveAddrs.oot.sharedCustomSaveLive,
    'oot.sharedCustomSaveLive',
  );
  const sharedMm = parseHex(
    data.liveAddrs.mm.sharedCustomSaveLive,
    'mm.sharedCustomSaveLive',
  );

  return {
    oot: [
      { name: 'oot_save_ctx', address: saveCtx.oot, length: OOT_SAVE_CTX_SIZE },
      ...buildSharedStateChunks(
        'oot',
        sharedOot,
        data.sharedLayout,
        data.sharedOffsets,
      ),
      {
        name: 'oot_playstate_scene',
        address: ADDR_OOT_PLAYSTATE + OOT_PLAY_OFF_SCENE_ID,
        length: 2,
      },
      {
        name: 'oot_playstate_room',
        address: ADDR_OOT_PLAYSTATE + OOT_PLAY_OFF_CURRENT_ROOM,
        length: 1,
      },
      {
        name: 'oot_playstate_link_age',
        address: ADDR_OOT_PLAYSTATE + OOT_PLAY_OFF_LINK_AGE_ON_LOAD,
        length: 1,
      },
      {
        name: 'oot_playstate_flags',
        address: ADDR_OOT_PLAYSTATE + OOT_PLAY_OFF_CHEST_FLAGS,
        length: OOT_PLAYSTATE_FLAGS_SIZE,
      },
    ],
    mm: [
      { name: 'mm_save_ctx', address: saveCtx.mm, length: MM_SAVE_CTX_SIZE },
      ...buildSharedStateChunks(
        'mm',
        sharedMm,
        data.sharedLayout,
        data.sharedOffsets,
      ),
      {
        name: 'mm_playstate_scene',
        address: ADDR_MM_PLAYSTATE + MM_PLAY_OFF_SCENE_ID,
        length: 2,
      },
      {
        name: 'mm_playstate_room',
        address: ADDR_MM_PLAYSTATE + MM_PLAY_OFF_CURRENT_ROOM,
        length: 1,
      },
      {
        name: 'mm_playstate_flags',
        address: ADDR_MM_PLAYSTATE + MM_PLAY_OFF_SWITCH0_FLAGS,
        length: MM_PLAYSTATE_FLAGS_SIZE,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Byte decoding helpers.
// ---------------------------------------------------------------------------
function readU16BE(buf: Buffer, off = 0): number {
  return (buf[off] << 8) | buf[off + 1];
}

function readU8(buf: Buffer, off = 0): number {
  return buf[off];
}

function readU32BE(buf: Buffer, off = 0): number {
  return (
    ((buf[off] << 24) |
      (buf[off + 1] << 16) |
      (buf[off + 2] << 8) |
      buf[off + 3]) >>>
    0
  );
}

interface RawChunk {
  name: string;
  address: number;
  length: number;
  data: string;
}

interface RawMessage {
  type: 'raw';
  schemaVersion: string;
  diff: boolean;
  refresh: boolean;
  sequence: number;
  game: string;
  saveIndex: number;
  chunks: RawChunk[];
}

// ---------------------------------------------------------------------------
// Decode the fields relevant to the scene-transition race from one frame.
// ---------------------------------------------------------------------------
function decodeSharedState(
  prefix: 'oot' | 'mm',
  byName: Map<string, Buffer>,
  fo: SharedFixedOffsets,
): Record<string, unknown> {
  const halfDays = byName.get(`${prefix}_shared_custom_save_half_days`);
  const coinsAndMasks = byName.get(
    `${prefix}_shared_custom_save_coins_and_masks`,
  );
  const bombchuBag = byName.get(
    `${prefix}_shared_custom_save_bombchu_bag_flags`,
  );
  const songNotes = byName.get(`${prefix}_shared_custom_save_song_notes`);
  const songFlagsOot = byName.get(
    `${prefix}_shared_custom_save_song_flags_oot`,
  );
  const songFlagsMm = byName.get(`${prefix}_shared_custom_save_song_flags_mm`);
  const rustyKeys = byName.get(`${prefix}_shared_custom_save_rusty_keys`);

  const coinsOffset = fo.coinsOffset;
  const ocarinaOotOffset = fo.ocarinaButtonMaskOotOffset - coinsOffset;
  const ocarinaMmOffset = fo.ocarinaButtonMaskMmOffset - coinsOffset;

  const coins: (number | null)[] = [];
  if (coinsAndMasks) {
    for (let i = 0; i < SHARED_COIN_COUNT; i++) {
      coins.push(
        coinsAndMasks.length >= (i + 1) * 2
          ? readU16BE(coinsAndMasks, i * 2)
          : null,
      );
    }
  }

  let ocarinaButtonMaskOot: number | null = null;
  let ocarinaButtonMaskMm: number | null = null;
  if (coinsAndMasks) {
    if (coinsAndMasks.length >= ocarinaOotOffset + 2) {
      ocarinaButtonMaskOot = readU16BE(coinsAndMasks, ocarinaOotOffset);
    }
    if (coinsAndMasks.length >= ocarinaMmOffset + 2) {
      ocarinaButtonMaskMm = readU16BE(coinsAndMasks, ocarinaMmOffset);
    }
  }

  let extraSwordsOot: number | null = null;
  let bombchuBagOot: number | null = null;
  let bombchuBagMm: number | null = null;
  if (bombchuBag && bombchuBag.length >= 1) {
    const flags = readU8(bombchuBag);
    extraSwordsOot =
      (flags >> SHARED_EXTRA_SWORDS_OOT_SHIFT) & SHARED_EXTRA_SWORDS_OOT_MASK;
    bombchuBagOot =
      (flags >> SHARED_BOMBCHU_BAG_OOT_SHIFT) & SHARED_BOMBCHU_BAG_MASK;
    bombchuBagMm =
      (flags >> SHARED_BOMBCHU_BAG_MM_SHIFT) & SHARED_BOMBCHU_BAG_MASK;
  }

  const songNotesArr: (number | null)[] = [];
  if (songNotes) {
    for (let i = 0; i < fo.songNoteCount; i++) {
      songNotesArr.push(
        songNotes.length >= i + 1 ? readU8(songNotes, i) : null,
      );
    }
  }

  const rustyKeysOotArr: (number | null)[] = [];
  const rustyKeysMmArr: (number | null)[] = [];
  if (rustyKeys) {
    for (let i = 0; i < fo.rustyKeysOotSize; i++) {
      rustyKeysOotArr.push(
        rustyKeys.length >= i + 1 ? readU8(rustyKeys, i) : null,
      );
    }
    for (let i = 0; i < fo.rustyKeysMmSize; i++) {
      rustyKeysMmArr.push(
        rustyKeys.length >= fo.rustyKeysOotSize + i + 1
          ? readU8(rustyKeys, fo.rustyKeysOotSize + i)
          : null,
      );
    }
  }

  return {
    halfDays: halfDays && halfDays.length >= 1 ? readU8(halfDays) : null,
    coins,
    ocarinaButtonMaskOot,
    ocarinaButtonMaskMm,
    extraSwordsOot,
    bombchuBagOot,
    bombchuBagMm,
    songNotes: songNotesArr,
    songFlagsOot:
      songFlagsOot && songFlagsOot.length >= 2 ? readU16BE(songFlagsOot) : null,
    songFlagsMm:
      songFlagsMm && songFlagsMm.length >= 1 ? readU8(songFlagsMm) : null,
    rustyKeysOot: rustyKeysOotArr,
    rustyKeysMm: rustyKeysMmArr,
  };
}

function decodeFrame(
  msg: RawMessage,
  fo: SharedFixedOffsets,
): Record<string, unknown> {
  const byName = new Map<string, Buffer>();
  for (const chunk of msg.chunks) {
    byName.set(chunk.name, Buffer.from(chunk.data, 'base64'));
  }

  if (msg.game === 'OoT') {
    const scene = byName.get('oot_playstate_scene');
    const room = byName.get('oot_playstate_room');
    const linkAge = byName.get('oot_playstate_link_age');
    const flags = byName.get('oot_playstate_flags');
    const saveCtx = byName.get('oot_save_ctx');

    return {
      oot: {
        liveScene: scene && scene.length >= 2 ? readU16BE(scene) : null,
        room: room && room.length >= 1 ? readU8(room) : null,
        linkAge: linkAge && linkAge.length >= 1 ? readU8(linkAge) : null,
        chest: flags && flags.length >= 4 ? readU32BE(flags, 0) : null,
        collect:
          flags &&
          flags.length >=
            OOT_PLAY_OFF_COLLECT_FLAGS - OOT_PLAY_OFF_CHEST_FLAGS + 4
            ? readU32BE(
                flags,
                OOT_PLAY_OFF_COLLECT_FLAGS - OOT_PLAY_OFF_CHEST_FLAGS,
              )
            : null,
        tempCollect:
          flags &&
          flags.length >=
            OOT_PLAY_OFF_TEMP_COLLECT - OOT_PLAY_OFF_CHEST_FLAGS + 4
            ? readU32BE(
                flags,
                OOT_PLAY_OFF_TEMP_COLLECT - OOT_PLAY_OFF_CHEST_FLAGS,
              )
            : null,
        saveScene:
          saveCtx && saveCtx.length >= OOT_OFF_SCENE_ID + 2
            ? readU16BE(saveCtx, OOT_OFF_SCENE_ID)
            : null,
      },
      shared: decodeSharedState('oot', byName, fo),
    };
  }

  const scene = byName.get('mm_playstate_scene');
  const room = byName.get('mm_playstate_room');
  const flags = byName.get('mm_playstate_flags');

  return {
    mm: {
      liveScene: scene && scene.length >= 2 ? readU16BE(scene) : null,
      room: room && room.length >= 1 ? readU8(room) : null,
      switch0: flags && flags.length >= 4 ? readU32BE(flags, 0) : null,
      switch1:
        flags &&
        flags.length >=
          MM_PLAY_OFF_SWITCH1_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS + 4
          ? readU32BE(
              flags,
              MM_PLAY_OFF_SWITCH1_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
            )
          : null,
      chest:
        flags &&
        flags.length >= MM_PLAY_OFF_CHEST_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS + 4
          ? readU32BE(
              flags,
              MM_PLAY_OFF_CHEST_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
            )
          : null,
      collect:
        flags &&
        flags.length >=
          MM_PLAY_OFF_COLLECT_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS + 4
          ? readU32BE(
              flags,
              MM_PLAY_OFF_COLLECT_FLAGS - MM_PLAY_OFF_SWITCH0_FLAGS,
            )
          : null,
    },
    shared: decodeSharedState('mm', byName, fo),
  };
}

function fmtFlags(decoded: Record<string, unknown>): string {
  const oot = decoded.oot as Record<string, unknown> | undefined;
  if (oot) {
    return [
      `scene=${oot.liveScene ?? '?'}`,
      `room=${oot.room ?? '?'}`,
      `chest=${hex32(oot.chest)}`,
      `collect=${hex32(oot.collect)}`,
      `temp=${hex32(oot.tempCollect)}`,
      `saveScene=${oot.saveScene ?? '?'}`,
      fmtShared(decoded.shared),
    ].join(' ');
  }
  const mm = decoded.mm as Record<string, unknown> | undefined;
  if (mm) {
    return [
      `scene=${mm.liveScene ?? '?'}`,
      `room=${mm.room ?? '?'}`,
      `switch0=${hex32(mm.switch0)}`,
      `switch1=${hex32(mm.switch1)}`,
      `chest=${hex32(mm.chest)}`,
      `collect=${hex32(mm.collect)}`,
      fmtShared(decoded.shared),
    ].join(' ');
  }
  return '(unknown game)';
}

function fmtShared(shared: unknown): string {
  const s = shared as Record<string, unknown> | undefined;
  if (!s) return '';
  const coins = Array.isArray(s.coins)
    ? (s.coins as (number | null)[]).map((c) => (c == null ? '?' : c)).join(',')
    : '?';
  return [
    `halfDays=${s.halfDays ?? '?'}`,
    `coins=[${coins}]`,
    `ocarinaOot=${hex16(s.ocarinaButtonMaskOot)}`,
    `ocarinaMm=${hex16(s.ocarinaButtonMaskMm)}`,
    `extraSwordsOot=${s.extraSwordsOot ?? '?'}`,
    `bombchuOot=${s.bombchuBagOot ?? '?'}`,
    `bombchuMm=${s.bombchuBagMm ?? '?'}`,
    `songFlagsOot=${hex16(s.songFlagsOot)}`,
    `songFlagsMm=${hex8(s.songFlagsMm)}`,
  ].join(' ');
}

function hex16(v: unknown): string {
  return typeof v === 'number' ? `0x${v.toString(16).padStart(4, '0')}` : '?';
}

function hex8(v: unknown): string {
  return typeof v === 'number' ? `0x${v.toString(16).padStart(2, '0')}` : '?';
}

function hex32(v: unknown): string {
  return typeof v === 'number' ? `0x${v.toString(16).padStart(8, '0')}` : '?';
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const versioned = findVersionedData(args.liveAddrs);
  const chunks = buildChunks(versioned);
  console.log(
    `Requesting ${chunks.oot.length} OoT chunks, ${chunks.mm.length} MM chunks.`,
  );

  const outputPath = args.output
    ? resolve(args.output)
    : resolve(
        `raw-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
      );
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  console.log(`Writing frames to: ${outputPath}`);
  console.log(
    args.durationSec > 0
      ? `Recording for ${args.durationSec}s...`
      : 'Recording until Ctrl+C...',
  );

  let frameCount = 0;
  let firstFrameAtMonoMs: number | null = null;
  let lastOotScene: number | null = null;
  let lastMmScene: number | null = null;

  const ws = new WebSocket(args.url, {
    headers: { Origin: ORIGIN },
  });

  ws.on('open', () => {
    console.log(`Connected to ${args.url}. Sending handshake...`);
    ws.send(
      JSON.stringify({
        type: 'handshake',
        features: ['raw'],
        flags: { protocol: 'raw' },
        memoryAreas: chunks,
      }),
    );
  });

  ws.on('message', (data: Buffer | string) => {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.log('Unparseable message:', text.slice(0, 200));
      return;
    }

    if (msg.type === 'handshAck') {
      console.log(
        `Handshake ACK: v${msg.version ?? '?'} (${msg.name ?? '?'}) features=${JSON.stringify(msg.features)}`,
      );
      return;
    }
    if (msg.type === 'error') {
      console.error(`Server error: ${msg.message}`);
      return;
    }
    if (msg.type !== 'raw') {
      return;
    }

    const raw = msg as unknown as RawMessage;
    const tsMs = Date.now();
    const nowMono = performance.now();
    if (firstFrameAtMonoMs === null) {
      firstFrameAtMonoMs = nowMono;
    }
    const recvMs = Math.round((nowMono - firstFrameAtMonoMs) * 1000) / 1000;

    const decoded = decodeFrame(raw, versioned.sharedOffsets);

    // Track scene changes for a compact console transition log.
    const oot = decoded.oot as { liveScene?: number | null } | undefined;
    const mm = decoded.mm as { liveScene?: number | null } | undefined;
    let transition = '';
    if (oot?.liveScene != null) {
      if (lastOotScene !== null && oot.liveScene !== lastOotScene) {
        transition = `  >>> SCENE CHANGE OoT ${lastOotScene} -> ${oot.liveScene}`;
      }
      lastOotScene = oot.liveScene;
    }
    if (mm?.liveScene != null) {
      if (lastMmScene !== null && mm.liveScene !== lastMmScene) {
        transition = `  >>> SCENE CHANGE MM ${lastMmScene} -> ${mm.liveScene}`;
      }
      lastMmScene = mm.liveScene;
    }

    console.log(
      `[seq ${raw.sequence}] ${raw.game} ${fmtFlags(decoded)}${transition}`,
    );

    appendFileSync(
      outputPath,
      JSON.stringify({
        tsMs,
        recvMs,
        sequence: raw.sequence,
        game: raw.game,
        saveIndex: raw.saveIndex,
        schemaVersion: raw.schemaVersion,
        diff: raw.diff,
        refresh: raw.refresh,
        chunks: raw.chunks,
        decoded,
      }) + '\n',
      'utf-8',
    );
    frameCount++;
  });

  ws.on('error', (err: Error) => {
    console.error('WebSocket error:', err.message);
    console.error(
      'Is the autotracker backend running? (ws://localhost:17026/). ' +
        'Start it before running this script.',
    );
  });

  ws.on('close', () => {
    console.log('Disconnected.');
    finalize();
  });

  let finalized = false;
  function finalize(): void {
    if (finalized) return;
    finalized = true;
    console.log(`\nDone. Recorded ${frameCount} frames to ${outputPath}`);
    try {
      ws.close();
    } catch {
      // ignore
    }
    process.exit(0);
  }

  if (args.durationSec > 0) {
    setTimeout(() => {
      console.log('\nDuration reached.');
      finalize();
    }, args.durationSec * 1000);
  }

  process.on('SIGINT', () => {
    console.log('\nInterrupted.');
    finalize();
  });
}

main();
