#!/usr/bin/env node --import tsx
/**
 * Snapshot comparison tool for autotracker debugging.
 *
 * Usage:
 *   node --import tsx scripts/compare_snapshots.ts <snapshot1.json> <snapshot2.json>
 *
 * Compares two autotracker snapshots and shows:
 *   - Metadata changes (game, sequence, save index)
 *   - Region byte-level diffs with bit-change highlighting
 *   - Known flag group decoding for mm_playstate_flags, mm_save_state_inventory, etc.
 *   - Item quantity changes
 *   - Location list changes
 */

import fs from 'fs';

// ── Types ────────────────────────────────────────────────────────────────────

interface SnapshotRegion {
  name: string;
  size: number;
  data: string;
  offset?: number;
}

interface SnapshotSummaryItem {
  id: string;
  qty: number;
}

interface SnapshotSummary {
  activeGame: string;
  saveIndex: number;
  items: SnapshotSummaryItem[];
  locations: string[];
}

interface RawFrame {
  sequence: number;
  diff?: Record<string, unknown>;
}

interface AutotrackerSnapshot {
  schemaVersion: number;
  createdAt: string;
  rawFrame?: RawFrame;
  summary?: SnapshotSummary;
  // Newer dumps carry the ground-truth raw parse in `expected` instead of the
  // tracker-space `summary` (which was removed as redundant).
  expected?: SnapshotSummary;
  regions: SnapshotRegion[];
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

// Extract flags
const noHex = args.includes('--no-hex');
const quiet = args.includes('--quiet');
const allRegions = args.includes('--all-regions');
const help = args.includes('--help') || args.includes('-h');

// Filter flags from positional args
const positional = args.filter((a) => !a.startsWith('--') && a !== '-h');
const [beforePath, afterPath] = positional;

if (help || positional.length < 2) {
  console.log(`Usage: node --import tsx scripts/compare_snapshots.ts [options] <before.json> <after.json>

Options:
  --no-hex          Omit hex dump, show only bit diffs
  --quiet           Only show changed regions, no per-byte details
  --all-regions     Compare all regions even if unchanged

Compares two autotracker snapshots and shows what changed at byte and bit level.`);
  process.exit(help ? 0 : 1);
}

// ── Load ─────────────────────────────────────────────────────────────────────
let before: AutotrackerSnapshot;
let after: AutotrackerSnapshot;
try {
  before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
} catch (e: unknown) {
  console.error(
    `Error loading snapshots: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
}

function validateSnapshot(s: AutotrackerSnapshot, label: string): boolean {
  if (!s || s.schemaVersion !== 1) {
    console.error(`${label}: invalid snapshot (schemaVersion != 1)`);
    return false;
  }
  if (!Array.isArray(s.regions)) {
    console.error(`${label}: missing regions array`);
    return false;
  }
  return true;
}
if (!validateSnapshot(before, 'Before') || !validateSnapshot(after, 'After')) {
  process.exit(1);
}

/** Prefer the ground-truth `expected`, fall back to the legacy `summary`. */
function snapshotState(s: AutotrackerSnapshot): SnapshotSummary | undefined {
  return s.expected ?? s.summary;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtHex(buf: Buffer, highlightOffsets: Set<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const byteStr = buf[i].toString(16).padStart(2, '0');
    if (highlightOffsets.has(i)) {
      parts.push(`\x1b[1;33m${byteStr}\x1b[0m`); // bold yellow
    } else {
      parts.push(byteStr);
    }
  }
  return parts.join(' ');
}

/** Format changed bits for a single byte offset */
function fmtBitDiff(
  offset: number,
  beforeByte: number,
  afterByte: number,
): string[] {
  const lines: string[] = [];
  for (let bit = 0; bit < 8; bit++) {
    const bSet = !!(beforeByte & (1 << bit));
    const aSet = !!(afterByte & (1 << bit));
    if (bSet !== aSet) {
      const globalBit = offset * 8 + bit;
      const arrow = bSet ? '\x1b[31m1→0\x1b[0m' : '\x1b[32m0→1\x1b[0m';
      lines.push(`    bit ${bit} (global ${globalBit}): ${arrow}`);
    }
  }
  return lines;
}

// ── Known region decoders ───────────────────────────────────────────────────

/** Playstate flags: known u32 fields at fixed offsets (OoT layout) */
const OOT_PLAYSTATE_FLAG_FIELDS: { offset: number; name: string }[] = [
  { offset: 0, name: 'chest' },
  { offset: 4, name: 'switch' },
  { offset: 8, name: 'collect' },
  { offset: 12, name: 'tempCollect' },
];

/** Playstate flags: known u32 fields at fixed offsets (MM layout) */
const MM_PLAYSTATE_FLAG_FIELDS: { offset: number; name: string }[] = [
  { offset: 0, name: 'switch0' },
  { offset: 4, name: 'switch1' },
  { offset: 16, name: 'chest' },
  { offset: 28, name: 'collect' },
];

/** OoT PermanentSceneFlags: 0x1c per scene */
const OOT_SCENE_FLAG_FIELDS: { offset: number; name: string }[] = [
  { offset: 0, name: 'chests' },
  { offset: 4, name: 'switches' },
  { offset: 8, name: 'roomClear' },
  { offset: 12, name: 'collectibles' },
  { offset: 16, name: 'unused' },
  { offset: 20, name: 'visitedRooms' },
  { offset: 24, name: 'visitedFloors' },
];

/** MM PermanentSceneFlags: 0x1c per scene */
const MM_SCENE_FLAG_FIELDS: { offset: number; name: string }[] = [
  { offset: 0, name: 'chest' },
  { offset: 4, name: 'switch0' },
  { offset: 8, name: 'switch1' },
  { offset: 12, name: 'clearedRoom' },
  { offset: 16, name: 'collectible' },
  { offset: 20, name: 'clearedFloors' },
  { offset: 24, name: 'rooms' },
];

/** MM CycleSceneFlags: 0x14 per scene */
const MM_CYCLE_FLAG_FIELDS: { offset: number; name: string }[] = [
  { offset: 0, name: 'chest' },
  { offset: 4, name: 'switch0' },
  { offset: 8, name: 'switch1' },
  { offset: 12, name: 'clearedRoom' },
  { offset: 16, name: 'collectible' },
];

interface RegionDecoder {
  description: string;
  decode(bBefore: Buffer, bAfter: Buffer): string[];
}

function buildRegionDecoder(name: string, size: number): RegionDecoder {
  // Playstate flags
  if (
    name.endsWith('_playstate_flags') ||
    name === 'mm_playstate_flags' ||
    name === 'oot_playstate_flags'
  ) {
    const isMM = name.startsWith('mm');
    const fields = isMM ? MM_PLAYSTATE_FLAG_FIELDS : OOT_PLAYSTATE_FLAG_FIELDS;
    const stride = Math.max(...fields.map((f) => f.offset)) + 4;
    return {
      description: `playstate flags (named u32 fields, ${isMM ? 'MM' : 'OoT'} layout)`,
      decode: (bB, bA) => decodeStructured(bB, bA, stride, fields, ''),
    };
  }

  // OoT scene flags (permanent, 0x1c per scene)
  if (name === 'oot_save_state_scene_flags') {
    const stride = 0x1c;
    return {
      description: `OoT scene flags (${OOT_SCENE_FLAG_FIELDS.length} fields × ${Math.floor(size / stride)} scenes)`,
      decode: (bB, bA) =>
        decodeStructured(bB, bA, stride, OOT_SCENE_FLAG_FIELDS, 'scene'),
    };
  }

  // MM scene flags (permanent, 0x1c per scene)
  if (
    name === 'oot_foreign_mm_save_scene_flags' ||
    name === 'mm_save_state_scene_flags'
  ) {
    const stride = 0x1c;
    return {
      description: `MM scene flags (${MM_SCENE_FLAG_FIELDS.length} fields × ${Math.floor(size / stride)} scenes)`,
      decode: (bB, bA) =>
        decodeStructured(bB, bA, stride, MM_SCENE_FLAG_FIELDS, 'scene'),
    };
  }

  // MM cycle flags (0x14 per scene)
  if (name === 'oot_foreign_mm_cycle_flags' || name === 'mm_cycle_flags') {
    const stride = 0x14;
    return {
      description: `MM cycle flags (${MM_CYCLE_FLAG_FIELDS.length} fields × ${Math.floor(size / stride)} scenes)`,
      decode: (bB, bA) =>
        decodeStructured(bB, bA, stride, MM_CYCLE_FLAG_FIELDS, 'scene'),
    };
  }

  // Generic: dividable by 4 → u32 interpretation
  if (size >= 4 && size % 4 === 0) {
    const u32Count = Math.floor(size / 4);
    return {
      description: `u32 bitmap (${u32Count} words)`,
      decode: (bB, bA) => decodeGenericU32(bB, bA),
    };
  }

  // Fallback: byte-level only
  return {
    description: 'raw bytes',
    decode: () => [],
  };
}

function decodeStructured(
  bBefore: Buffer,
  bAfter: Buffer,
  stride: number,
  fields: { offset: number; name: string }[],
  groupLabel: string,
): string[] {
  const lines: string[] = [];
  const numGroups = Math.max(
    Math.ceil(bBefore.length / stride),
    Math.ceil(bAfter.length / stride),
  );
  const maxLen = Math.min(bBefore.length, bAfter.length);

  for (let groupIdx = 0; groupIdx < numGroups; groupIdx++) {
    const base = groupIdx * stride;
    const groupPrefix = groupLabel ? `[${groupLabel} ${groupIdx}] ` : '';

    for (const field of fields) {
      const off = base + field.offset;
      if (off + 4 > maxLen) continue;
      const bVal = bBefore.readUInt32BE(off);
      const aVal = bAfter.readUInt32BE(off);
      if (bVal === aVal) continue;

      lines.push(
        `   ◀ ${groupPrefix}${field.name}: 0x${bVal.toString(16).padStart(8, '0')} → 0x${aVal.toString(16).padStart(8, '0')}`,
      );
      const bitLines = fmtU32BitDiff(bVal, aVal);
      for (const bl of bitLines) lines.push(bl);
    }
  }
  return lines;
}

function decodeGenericU32(bBefore: Buffer, bAfter: Buffer): string[] {
  const lines: string[] = [];
  const maxLen = Math.min(bBefore.length, bAfter.length);
  const u32Count = Math.floor(maxLen / 4);
  let changedCount = 0;
  const MAX_CHANGED = 20;

  for (let i = 0; i < u32Count; i++) {
    const off = i * 4;
    const bVal = bBefore.readUInt32BE(off);
    const aVal = bAfter.readUInt32BE(off);
    if (bVal === aVal) continue;
    if (changedCount >= MAX_CHANGED) {
      lines.push(`   ... (${u32Count - i} more words, omitted for brevity)`);
      break;
    }
    changedCount++;
    lines.push(
      `   ◀ u32[${i}] (offset 0x${off.toString(16)}): 0x${bVal.toString(16).padStart(8, '0')} → 0x${aVal.toString(16).padStart(8, '0')}`,
    );
    const bitLines = fmtU32BitDiff(bVal, aVal);
    for (const bl of bitLines) lines.push(bl);
  }
  return lines;
}

function fmtU32BitDiff(beforeVal: number, afterVal: number): string[] {
  const lines: string[] = [];
  for (let bit = 0; bit < 32; bit++) {
    const bSet = !!(beforeVal & (1 << bit));
    const aSet = !!(afterVal & (1 << bit));
    if (bSet !== aSet) {
      const arrow = bSet ? '\x1b[31m1→0\x1b[0m' : '\x1b[32m0→1\x1b[0m';
      lines.push(`     bit ${String(bit).padStart(2)}: ${arrow}`);
    }
  }
  return lines;
}

// ── Main comparison ──────────────────────────────────────────────────────────

console.log(
  '\n══════════════════════════════════════════════════════════════════',
);
console.log('  SNAPSHOT COMPARISON');
console.log(
  '══════════════════════════════════════════════════════════════════',
);

// Metadata
console.log(
  `\nBefore: ${before.createdAt}  (sequence ${before.rawFrame?.sequence ?? '?'})`,
);
console.log(
  `After:  ${after.createdAt}  (sequence ${after.rawFrame?.sequence ?? '?'})`,
);

const beforeState = snapshotState(before);
const afterState = snapshotState(after);

const bGame = beforeState?.activeGame ?? '?';
const aGame = afterState?.activeGame ?? '?';
if (bGame !== aGame)
  console.log(`\x1b[33mGame changed: ${bGame} → ${aGame}\x1b[0m`);
console.log(`Game: ${aGame},  Save: ${afterState?.saveIndex ?? '?'}`);

// ── Summary changes ─────────────────────────────────────────────────────────
console.log(
  '\n── Summary Changes ────────────────────────────────────────────────',
);

const bItems = new Map<string, number>();
const aItems = new Map<string, number>();
for (const i of beforeState?.items ?? []) bItems.set(i.id, i.qty ?? 1);
for (const i of afterState?.items ?? []) aItems.set(i.id, i.qty ?? 1);

const itemChanges: string[] = [];
for (const [id, qty] of aItems) {
  const beforeQty = bItems.get(id) ?? 0;
  if (qty !== beforeQty) itemChanges.push(`  ${id}: ${beforeQty} → ${qty}`);
}
for (const [id, qty] of bItems) {
  if (!aItems.has(id)) itemChanges.push(`  ${id}: ${qty} → 0 (removed)`);
}
if (itemChanges.length > 0) {
  console.log(`Items changed (${itemChanges.length}):`);
  console.log(itemChanges.join('\n'));
} else {
  console.log('Items: no changes');
}

// Stray fairy summary
const fairyRegions = ['WF', 'SH', 'GB', 'ST'];
const fairyChanges: string[] = [];
for (const region of fairyRegions) {
  const b = bItems.get(`MM_STRAY_FAIRY_${region}`) ?? 0;
  const a = aItems.get(`MM_STRAY_FAIRY_${region}`) ?? 0;
  if (b !== a) fairyChanges.push(`  MM_STRAY_FAIRY_${region}: ${b} → ${a}`);
}
if (fairyChanges.length > 0) {
  console.log(`\nStray Fairy qty changes:`);
  console.log(fairyChanges.join('\n'));
}

// Location changes
const bLocs = new Set(beforeState?.locations ?? []);
const aLocs = new Set(afterState?.locations ?? []);
const added = [...aLocs].filter((l) => !bLocs.has(l));
const removed = [...bLocs].filter((l) => !aLocs.has(l));
if (added.length > 0)
  console.log(
    `\nLocations added (${added.length}):\n${added.map((l) => `  + ${l}`).join('\n')}`,
  );
if (removed.length > 0)
  console.log(
    `Locations removed (${removed.length}):\n${removed.map((l) => `  - ${l}`).join('\n')}`,
  );

// ── Region comparison ───────────────────────────────────────────────────────
console.log(
  '\n── Region Byte/Bit Diffs ───────────────────────────────────────────',
);

const beforeRegions = new Map<
  string,
  { size: number; data: string; offset?: number }
>();
const afterRegions = new Map<
  string,
  { size: number; data: string; offset?: number }
>();
for (const r of before.regions) beforeRegions.set(r.name, r);
for (const r of after.regions) afterRegions.set(r.name, r);

let changedCount = 0;

for (const [name, br] of beforeRegions) {
  const ar = afterRegions.get(name);
  if (!ar) {
    console.log(`\n\x1b[33m[REMOVED] ${name}\x1b[0m`);
    changedCount++;
    continue;
  }

  if (br.data === ar.data && !allRegions) continue;
  changedCount++;

  const bBuf = Buffer.from(br.data, 'base64');
  const aBuf = Buffer.from(ar.data, 'base64');
  const minLen = Math.min(bBuf.length, aBuf.length);
  const maxLen = Math.max(bBuf.length, aBuf.length);

  const decoder = buildRegionDecoder(name, Math.max(br.size, ar.size));
  const decodedLines = br.data !== ar.data ? decoder.decode(bBuf, aBuf) : [];

  console.log(`\n▸ ${name}  (${br.size} bytes) [${decoder.description}]`);

  if (br.data === ar.data) {
    console.log('  (unchanged)');
    continue;
  }

  // Find changed byte offsets
  const changedOffsets = new Set<number>();
  for (let i = 0; i < minLen; i++) {
    if (bBuf[i] !== aBuf[i]) changedOffsets.add(i);
  }
  for (let i = minLen; i < maxLen; i++) changedOffsets.add(i);

  if (!quiet) {
    // Show hex dumps
    if (!noHex) {
      console.log(`  Before: ${fmtHex(bBuf, changedOffsets)}`);
      console.log(`  After:  ${fmtHex(aBuf, changedOffsets)}`);
    }

    // Show per-byte bit diffs
    for (const offset of changedOffsets) {
      if (offset >= minLen) {
        const isBefore = offset < bBuf.length;
        console.log(
          `  Byte ${offset} (0x${offset.toString(16)}): ${isBefore ? 'was present' : 'was absent'} → ${!isBefore ? 'was absent' : 'now present'}`,
        );
        continue;
      }
      console.log(
        `  Byte ${offset} (0x${offset.toString(16)}): 0x${bBuf[offset].toString(16).padStart(2, '0')} → 0x${aBuf[offset].toString(16).padStart(2, '0')}`,
      );
      const bitLines = fmtBitDiff(offset, bBuf[offset], aBuf[offset]);
      console.log(bitLines.join('\n'));
    }
  }

  // ── Smart decoding output ─────────────────────────────────────────────────
  if (decodedLines.length > 0) {
    console.log(`\n  ⚑ Interpretation:`);
    console.log(decodedLines.join('\n'));
  }
}

// Check for new regions
for (const [name] of afterRegions) {
  if (!beforeRegions.has(name)) {
    console.log(`\n\x1b[32m[NEW] ${name}\x1b[0m`);
    changedCount++;
  }
}

if (changedCount === 0) {
  console.log('\n  (no regions changed)');
} else {
  console.log(`\n  ${changedCount} region(s) changed.`);
}

// ── rawFrame diff summary ────────────────────────────────────────────────────
if (after.rawFrame?.diff) {
  console.log(
    '\n── Raw Frame Diff ──────────────────────────────────────────────────',
  );
  const diffKeys = Object.keys(after.rawFrame.diff);
  console.log(`Keys in diff: ${diffKeys.join(', ')}`);
}

console.log(
  '\n══════════════════════════════════════════════════════════════════\n',
);
