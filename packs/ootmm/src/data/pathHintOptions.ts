// ── Path Hint Options ──
// Shared between the manual hint form and spoiler-log parsing so both agree on
// the dungeon detail ids and names.

export interface PathSubIdOption {
  value: number;
  label: string;
  /** Alternative names the spoiler log may use for this option. */
  aliases?: string[];
}

/**
 * Dungeon path hint details.
 *
 * The ids are persisted on `RecordedPathHint.subId`, so the existing values
 * must stay stable; new dungeons are appended. Mirrors the dungeons that
 * OoTMM's `analysis-path.ts` can emit "Path to ..." hints for.
 */
export const DUNGEON_PATH_OPTIONS: PathSubIdOption[] = [
  { value: 0, label: 'Deku Tree' },
  { value: 1, label: "Dodongo's Cavern", aliases: ['Dodongo Cavern'] },
  { value: 2, label: "Jabu-Jabu's Belly", aliases: ['Jabu-Jabu'] },
  { value: 3, label: 'Forest Temple' },
  { value: 4, label: 'Fire Temple' },
  { value: 5, label: 'Water Temple' },
  { value: 6, label: 'Shadow Temple' },
  { value: 7, label: 'Spirit Temple' },
  { value: 8, label: 'Bottom of the Well' },
  { value: 9, label: 'Ice Cavern' },
  {
    value: 10,
    label: "Gerudo's Training Grounds",
    aliases: ['Gerudo Training Grounds'],
  },
  { value: 11, label: "Ganon's Castle", aliases: ['Ganon Castle'] },
  { value: 12, label: 'Woodfall Temple' },
  { value: 13, label: 'Snowhead Temple' },
  { value: 14, label: 'Great Bay Temple' },
  { value: 15, label: 'Stone Tower Temple' },
  { value: 16, label: 'Swamp Spider House' },
  { value: 17, label: 'Ocean Spider House' },
  { value: 18, label: 'Beneath the Well' },
  { value: 19, label: 'Ancient Castle of Ikana' },
  { value: 20, label: 'Secret Shrine' },
  { value: 21, label: 'Inverted Stone Tower Temple' },
  { value: 22, label: 'Pirate Fortress', aliases: ["Pirates' Fortress"] },
  { value: 23, label: 'Ganon Tower', aliases: ["Ganon's Tower"] },
  { value: 24, label: 'Clock Tower Roof' },
];

/** Normalized spoiler-log name → dungeon subId. */
export const DUNGEON_NAME_TO_SUBID = new Map<string, number>();
for (const option of DUNGEON_PATH_OPTIONS) {
  for (const name of [option.label, ...(option.aliases ?? [])]) {
    DUNGEON_NAME_TO_SUBID.set(
      name.toLowerCase().replace(/\s+/g, ' ').trim(),
      option.value,
    );
  }
}
