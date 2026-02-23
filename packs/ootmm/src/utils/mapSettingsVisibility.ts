import type { MapMarkerSettingsVisibility } from '../data/maps/types';

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function valueMatchesExpected(
  actual: unknown,
  expected: string | number | boolean | Array<string | number | boolean>,
): boolean {
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((expectedValue) => {
    if (actual === expectedValue) return true;

    if (Array.isArray(actual) && actual.includes(expectedValue)) {
      return true;
    }

    const expectedBool = coerceBoolean(expectedValue);
    if (expectedBool !== null) {
      const actualBool = coerceBoolean(actual);
      if (actualBool !== null) return actualBool === expectedBool;
    }

    return false;
  });
}

function includesInArray(
  values: unknown[],
  expected: string | number | boolean | Array<string | number | boolean>,
): boolean {
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  return expectedValues.some((expectedValue) =>
    values.some((value) => valueMatchesExpected(value, expectedValue)),
  );
}

type SetLikeSetting = {
  type?: unknown;
  values?: unknown;
  set?: unknown;
  unset?: unknown;
};

function isSetLikeSetting(value: unknown): value is SetLikeSetting {
  return Boolean(value && typeof value === 'object' && 'type' in value);
}

function containsExpectedValue(
  actual: unknown,
  expected: string | number | boolean | Array<string | number | boolean>,
): boolean {
  if (valueMatchesExpected(actual, expected)) return true;

  if (Array.isArray(actual)) {
    return includesInArray(actual, expected);
  }

  if (isSetLikeSetting(actual)) {
    const mode = typeof actual.type === 'string' ? actual.type : '';
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    if (mode === 'specific') {
      return Array.isArray(actual.values)
        ? includesInArray(actual.values, expected)
        : false;
    }
    if (mode === 'random-mixed') {
      return Array.isArray(actual.set)
        ? includesInArray(actual.set, expected)
        : false;
    }
    return false;
  }

  return false;
}

function getSettingValue(
  settings: Record<string, unknown>,
  keyPath: string,
): unknown {
  if (!keyPath.includes('.')) return settings[keyPath];
  return keyPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, settings);
}

export function matchesMapSettingsVisibility(
  visibility: MapMarkerSettingsVisibility | undefined,
  settings: Record<string, unknown> | null | undefined,
): boolean {
  if (!visibility) return true;

  if (visibility.settings) {
    if (!settings) return false;
    for (const [settingKey, expectedValue] of Object.entries(
      visibility.settings,
    )) {
      const actualValue = getSettingValue(settings, settingKey);
      if (!valueMatchesExpected(actualValue, expectedValue)) return false;
    }
  }

  if (visibility.contains) {
    if (!settings) return false;
    for (const [settingKey, expectedValue] of Object.entries(
      visibility.contains,
    )) {
      const actualValue = getSettingValue(settings, settingKey);
      if (!containsExpectedValue(actualValue, expectedValue)) return false;
    }
  }

  if (visibility.notContains) {
    if (!settings) return false;
    for (const [settingKey, expectedValue] of Object.entries(
      visibility.notContains,
    )) {
      const actualValue = getSettingValue(settings, settingKey);
      if (containsExpectedValue(actualValue, expectedValue)) return false;
    }
  }

  if (visibility.and && visibility.and.length > 0) {
    if (
      !visibility.and.every((entry) =>
        matchesMapSettingsVisibility(entry, settings),
      )
    ) {
      return false;
    }
  }

  if (visibility.or && visibility.or.length > 0) {
    if (
      !visibility.or.some((entry) =>
        matchesMapSettingsVisibility(entry, settings),
      )
    ) {
      return false;
    }
  }

  return true;
}
