export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getSearchTerms(rawQuery: string): string[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  return query.split(' ');
}

export function matchesNormalizedSearchTerms(
  normalizedValues: readonly string[],
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  if (normalizedValues.length === 0) return false;
  return terms.every((term) =>
    normalizedValues.some((value) => value.includes(term)),
  );
}

export function matchesSearchTerms(
  values: readonly string[],
  rawQuery: string,
): boolean {
  const terms = getSearchTerms(rawQuery);
  if (terms.length === 0) return true;
  const normalizedValues = values
    .map((value) => normalizeSearchText(value))
    .filter((value) => value.length > 0);
  return matchesNormalizedSearchTerms(normalizedValues, terms);
}
