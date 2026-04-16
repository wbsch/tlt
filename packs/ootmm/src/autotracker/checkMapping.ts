type AutotrackerCheckLike = {
  id?: string;
  name?: string;
};

type ResolveLocationCode = (code: string) => string[];

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values));
}

export function resolveAutotrackerCheckToLocationIds(
  check: AutotrackerCheckLike,
  resolveLocationCode: ResolveLocationCode,
): string[] {
  const rawId = check.id?.trim();
  const rawName = check.name?.trim();
  const candidateCodes: string[] = [];

  if (rawId) {
    candidateCodes.push(rawId);
  }

  if (rawName) {
    candidateCodes.push(rawName);
    if (!/^(?:oot|mm)(?:\s+|[-_:]+)/i.test(rawName)) {
      candidateCodes.push(`OOT ${rawName}`);
      candidateCodes.push(`MM ${rawName}`);
    }
  }

  const resolvedLocationIds: string[] = [];
  for (const code of candidateCodes) {
    resolvedLocationIds.push(...resolveLocationCode(code));
  }

  return uniqueStrings(resolvedLocationIds);
}
