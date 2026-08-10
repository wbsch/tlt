// Decode xflagsOot bitmap from a snapshot dump and report which bits are set,
// and what names v32_0 / v31_1 assign to those bits.
import { readFileSync } from 'node:fs';

const snapshotPath =
  process.argv[2] ??
  '/home/silke/Downloads/autotracker-snapshot-20260810-204439.json';
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const region = snapshot.regions.find(
  (r: { name: string }) => r.name === 'oot_shared_custom_save_bitmap_xflagsOot',
);
if (!region) {
  console.error('no xflagsOot region in snapshot');
  process.exit(1);
}
const buf = Buffer.from(region.data, 'base64');
console.log(`xflagsOot size: ${buf.length} bytes`);

const setBits: number[] = [];
for (let byteIndex = 0; byteIndex < buf.length; byteIndex++) {
  const value = buf[byteIndex];
  for (let bit = 0; bit < 8; bit++) {
    if ((value & (1 << bit)) !== 0) setBits.push(byteIndex * 8 + bit);
  }
}
console.log(`set bits: ${setBits.join(', ')}`);

// Load both location tables
function loadNames(version: string): Map<number, string> {
  const locs = JSON.parse(
    readFileSync(
      `/home/silke/stuff/repos/tlt/packs/ootmm/src/autotracker/data/${version}/locations.json`,
      'utf8',
    ),
  );
  const map = new Map<number, string>();
  for (const entry of locs.bitmap) {
    if (entry.block === 'xflagsOot') map.set(entry.bit, entry.name);
  }
  return map;
}

const v32 = loadNames('v32_0');
const v31 = loadNames('v31_1');

for (const bit of setBits) {
  console.log(
    `bit ${bit}: v32_0="${v32.get(bit) ?? '—'}"  v31_1="${v31.get(bit) ?? '—'}"`,
  );
}
