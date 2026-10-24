import type { SettingDefinition } from '@/types/tracker';
import * as SettingsMod from '@ootmm/core/settings/data';
import {
  MM_AGE_REQ_ITEMS,
  isMmAgeReqItemInPool,
  type MmAgeReqItemDef,
} from '@ootmm/core/mm-age-requirements';
import settingsWhitelist from './settingsWhitelist.json';
import { DEFAULT_OOTMM_SETTINGS } from '../types/settings';

// Vite/tsx resolves this CJS-style package through an interop wrapper where
// the actual exports currently live under `default`.
const resolveInteropModule = (mod: unknown): Record<string, unknown> => {
  const modRecord = mod as Record<string, unknown>;
  const defaultValue = Object.prototype.hasOwnProperty.call(
    modRecord,
    'default',
  )
    ? modRecord['default']
    : undefined;
  if (defaultValue && typeof defaultValue === 'object') {
    return defaultValue as Record<string, unknown>;
  }

  const moduleExportsValue = Object.prototype.hasOwnProperty.call(
    modRecord,
    'module.exports',
  )
    ? modRecord['module.exports']
    : undefined;
  if (moduleExportsValue && typeof moduleExportsValue === 'object') {
    return moduleExportsValue as Record<string, unknown>;
  }

  return modRecord;
};

const settingsDataModule = resolveInteropModule(SettingsMod);

const { SETTINGS, SUBCATEGORIES } = settingsDataModule as {
  SETTINGS?: unknown[];
  SUBCATEGORIES?: { categories?: { key?: string; category?: string }[] }[];
};

const MM_AGE_REQUIREMENT_CATEGORY = 'MM Age Requirements';

/**
 * Both age flags of an MM age requirement item are `false` when no age is
 * restricted.
 */
export type MmAgeRequirementValue = 'both' | 'child' | 'adult';

export const MM_AGE_REQUIREMENT_VALUES: readonly MmAgeRequirementValue[] = [
  'both',
  'child',
  'adult',
];

export function readMmAgeRequirement(
  settings: Record<string, unknown>,
  childKey: string,
  adultKey: string,
): MmAgeRequirementValue {
  const child = Boolean(settings[childKey]);
  const adult = Boolean(settings[adultKey]);

  if (adult) {
    // OoTMM treats both flags set as a child-only restriction.
    return child ? 'child' : 'adult';
  }

  return child ? 'child' : 'both';
}

export function writeMmAgeRequirement(
  settings: Record<string, unknown>,
  childKey: string,
  adultKey: string,
  value: MmAgeRequirementValue,
): Record<string, unknown> {
  return {
    ...settings,
    [childKey]: value === 'child',
    [adultKey]: value === 'adult',
  };
}

/**
 * MM only has age requirements when both ages are reachable in MM, which
 * requires the Adult Mask or cross-game age.
 */
function hasMmAgeRequirements(settings: Record<string, unknown>): boolean {
  const games = settings.games;
  if (games !== 'ootmm' && games !== 'mm') return false;
  return Boolean(settings.crossAge) || Boolean(settings.adultMaskMm);
}

function isMmAgeRequirementFlagKey(key: string): boolean {
  return MM_AGE_REQ_ITEMS.some(
    (item) => item.childSetting === key || item.adultSetting === key,
  );
}

function buildMmAgeRequirementDefinition(
  item: MmAgeReqItemDef,
): SettingDefinition {
  return {
    key: `mmAgeReq.${item.id}`,
    label: item.label,
    description: `Which age can equip ${item.label} in MM.`,
    type: 'select',
    default: 'both',
    category: MM_AGE_REQUIREMENT_CATEGORY,
    options: MM_AGE_REQUIREMENT_VALUES.map((value) => ({
      value,
      label: value === 'both' ? 'Both' : value === 'child' ? 'Child' : 'Adult',
    })),
    // Only items that are actually part of the MM item pool can have an age
    // requirement, and only when MM can switch between both ages.
    cond: (settings) =>
      hasMmAgeRequirements(settings) && isMmAgeReqItemInPool(settings, item),
    control: {
      kind: 'mm-age-requirement',
      childKey: item.childSetting,
      adultKey: item.adultSetting,
    },
  };
}

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
  ['items.mmAgeRequirements', MM_AGE_REQUIREMENT_CATEGORY],
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

  for (const [key, value] of Object.entries(DEFAULT_OOTMM_SETTINGS)) {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) continue;
    defaults[key] = deepCloneDefault(value);
  }

  return defaults;
};

const BASE_SETTINGS_DEFINITIONS: SettingDefinition[] = (SETTINGS ?? [])
  .map(transformOoTMMSetting)
  .filter((s): s is SettingDefinition => s !== null);

export const ALL_SETTINGS_DEFINITIONS = applyDefaults(
  BASE_SETTINGS_DEFINITIONS,
);

/**
 * Definitions rendered in the settings UI. The raw child/adult flags of an MM
 * age requirement item are kept (hidden) so that spoiler logs can still be
 * imported, while the UI shows a single age dropdown per item.
 */
const buildSettingsDefinitions = (
  definitions: SettingDefinition[],
): SettingDefinition[] => {
  const result: SettingDefinition[] = [];

  for (const def of definitions) {
    if (!isMmAgeRequirementFlagKey(def.key)) {
      result.push(def);
      continue;
    }

    result.push({ ...def, hidden: true });

    const item = MM_AGE_REQ_ITEMS.find(
      (entry) => entry.childSetting === def.key,
    );
    if (item) {
      result.push(buildMmAgeRequirementDefinition(item));
    }
  }

  return result;
};

export const SETTINGS_DEFINITIONS = buildSettingsDefinitions(
  applyWhitelist(ALL_SETTINGS_DEFINITIONS),
);
export const TRACKER_DEFAULT_SETTINGS = buildDefaultsRecord(
  ALL_SETTINGS_DEFINITIONS,
);
