import type { SettingDefinition } from '@/types/tracker';
import * as SettingsMod from '@ootmm/core/settings/data.js';
import settingsWhitelist from './settingsWhitelist.json';
import { DEFAULT_OOTMM_SETTINGS } from '../types/settings';

// CJS interop: grab SETTINGS array from module exports
const { SETTINGS, SUBCATEGORIES } = SettingsMod as {
  SETTINGS?: unknown[];
  SUBCATEGORIES?: { categories?: { key?: string; category?: string }[] }[];
};

const CATEGORY_LABELS = new Map<string, string>([
  ['main', 'Main'],
  ['main.shuffle', 'Shuffle'],
  ['main.world', 'World Settings'],
  ['main.qol', 'Quality of Life'],
  ['main.events', 'Events'],
  ['main.cross', 'Cross-Game'],
  ['main.prices', 'Prices'],
  ['main.camc', 'CAMC'],
  ['main.misc', 'Miscellaneous'],
  ['main.nologic', 'No Logic'],
  ['items.shared', 'Shared Items'],
  ['items.ageless', 'Ageless Items'],
  ['items.progressive', 'Progressive Items'],
  ['items.extensions', 'Item Extensions'],
  ['entrances', 'Entrance Randomizer'],
  ['hints', 'Hints'],
]);

const SUBCATEGORY_LABELS = new Map<string, string>();
if (Array.isArray(SUBCATEGORIES)) {
  for (const entry of SUBCATEGORIES) {
    for (const category of entry?.categories ?? []) {
      if (category?.category && category?.key) {
        SUBCATEGORY_LABELS.set(category.category, category.key);
      }
    }
  }
}

const toTitleCase = (value: string): string =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');

const resolveCategoryLabel = (rawCategory?: string): string => {
  if (!rawCategory) return 'Other';
  const labeled =
    SUBCATEGORY_LABELS.get(rawCategory) ?? CATEGORY_LABELS.get(rawCategory);
  if (labeled) return labeled;

  const [root, remainder] = rawCategory.split('.', 2);
  if (!remainder) return toTitleCase(root);
  if (root === 'main') return toTitleCase(remainder);
  if (root === 'items') return `${toTitleCase(remainder)} Items`;
  return toTitleCase(rawCategory);
};

/**
 * Settings definitions for OoTMM tracker
 * Loaded directly from OoTMM settings data and transformed for UI
 */
function transformOoTMMSetting(setting: unknown): SettingDefinition | null {
  const raw = setting as {
    key?: string;
    name?: string;
    description?: string;
    category?: string;
    type?: string;
    cond?: unknown;
    min?: unknown;
    max?: unknown;
    values?: unknown[];
  };

  const base = {
    key: raw.key ?? '',
    label: raw.name ?? '',
    description: raw.description,
    default: undefined,
    category: resolveCategoryLabel(raw.category),
    cond:
      typeof raw.cond === 'function'
        ? (raw.cond as (settings: Record<string, unknown>) => boolean)
        : undefined,
  };

  const options = raw.values?.map((v: unknown) => {
    const option = v as {
      value?: unknown;
      name?: string;
      description?: string;
      cond?: unknown;
    };
    return {
      value: option.value,
      label: option.name ?? '',
      description: option.description,
      cond:
        typeof option.cond === 'function'
          ? (option.cond as (settings: Record<string, unknown>) => boolean)
          : undefined,
    };
  });

  const min =
    typeof raw.min === 'number'
      ? raw.min
      : typeof raw.min === 'function'
        ? (raw.min as (settings: Record<string, unknown>) => number)
        : undefined;
  const max =
    typeof raw.max === 'number'
      ? raw.max
      : typeof raw.max === 'function'
        ? (raw.max as (settings: Record<string, unknown>) => number)
        : undefined;

  switch (raw.type) {
    case 'boolean':
      return { ...base, type: 'boolean' };

    case 'number':
      return { ...base, type: 'number', min, max };

    case 'enum':
      return {
        ...base,
        type: 'select',
        options,
      };

    case 'set':
      return {
        ...base,
        type: 'multi-select',
        options,
      };

    default:
      return null;
  }
}

const SETTINGS_WHITELIST = new Set(settingsWhitelist);

const applyWhitelist = (
  definitions: SettingDefinition[],
): SettingDefinition[] => {
  const definitionKeys = new Set(definitions.map((def) => def.key));
  const missing = settingsWhitelist.filter((key) => !definitionKeys.has(key));
  if (missing.length > 0) {
    console.warn(
      `[OoTMM Settings] ${missing.length} whitelist entries have no definition: ${missing.join(', ')}`,
    );
  }
  return definitions.filter((def) => SETTINGS_WHITELIST.has(def.key));
};

const deepCloneDefault = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCloneDefault(entry));
  }
  if (value && typeof value === 'object') {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      cloned[key] = deepCloneDefault(entry);
    }
    return cloned;
  }
  return value;
};

const normalizeMultiSelectDefault = (
  value: unknown,
): { type: 'all' | 'none' | 'specific'; values?: unknown[] } => {
  if (value && typeof value === 'object' && 'type' in value) {
    return deepCloneDefault(value) as {
      type: 'all' | 'none' | 'specific';
      values?: unknown[];
    };
  }
  if (value === 'all' || value === 'none') {
    return { type: value };
  }
  return { type: 'none' };
};

const applyDefaults = (definitions: SettingDefinition[]): SettingDefinition[] =>
  definitions.map((def) => {
    if (
      !Object.prototype.hasOwnProperty.call(DEFAULT_OOTMM_SETTINGS, def.key)
    ) {
      console.warn(
        `[OoTMM Settings] Missing default for ${def.key} in DEFAULT_OOTMM_SETTINGS`,
      );
      return def;
    }
    const rawDefault = (DEFAULT_OOTMM_SETTINGS as Record<string, unknown>)[
      def.key
    ];
    const normalizedDefault =
      def.type === 'multi-select'
        ? normalizeMultiSelectDefault(rawDefault)
        : deepCloneDefault(rawDefault);
    return { ...def, default: normalizedDefault };
  });

const buildDefaultsRecord = (
  definitions: SettingDefinition[],
): Record<string, unknown> => {
  const defaults: Record<string, unknown> = {};
  for (const def of definitions) {
    defaults[def.key] = deepCloneDefault(def.default);
  }
  return defaults;
};

const BASE_SETTINGS_DEFINITIONS: SettingDefinition[] = (SETTINGS ?? [])
  .map(transformOoTMMSetting)
  .filter((s): s is SettingDefinition => s !== null);

export const ALL_SETTINGS_DEFINITIONS = applyDefaults(
  BASE_SETTINGS_DEFINITIONS,
);
export const SETTINGS_DEFINITIONS = applyWhitelist(ALL_SETTINGS_DEFINITIONS);
export const TRACKER_DEFAULT_SETTINGS = buildDefaultsRecord(
  ALL_SETTINGS_DEFINITIONS,
);
