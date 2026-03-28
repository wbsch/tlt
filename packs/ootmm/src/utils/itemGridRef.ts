export interface ItemGridEmptyRef {
  empty: true;
}

export type ItemGridOrCandidate = string | ItemGridEmptyRef | ItemGridOrRef;

export interface ItemGridOrRef {
  or: ItemGridOrCandidate[];
}

export interface ItemGridAliasRef {
  ref: string;
  item: string;
  title?: string;
}

export interface ItemGridMultiActivateRef {
  item: string;
  activateAlso: string[];
  title?: string;
}

export type ItemGridRef =
  | string
  | ItemGridOrRef
  | ItemGridAliasRef
  | ItemGridMultiActivateRef
  | ItemGridEmptyRef;

function isItemGridOrCandidate(value: unknown): value is ItemGridOrCandidate {
  return (
    typeof value === 'string' ||
    isItemGridEmptyRef(value) ||
    isItemGridOrRef(value)
  );
}

export function isItemGridOrRef(value: unknown): value is ItemGridOrRef {
  if (!value || typeof value !== 'object') return false;
  const orValues = (value as { or?: unknown }).or;
  return Array.isArray(orValues) && orValues.every(isItemGridOrCandidate);
}

export function isItemGridAliasRef(value: unknown): value is ItemGridAliasRef {
  if (!value || typeof value !== 'object') return false;
  const ref = (value as { ref?: unknown }).ref;
  const item = (value as { item?: unknown }).item;
  const title = (value as { title?: unknown }).title;
  if (typeof ref !== 'string' || typeof item !== 'string') return false;
  if (title !== undefined && typeof title !== 'string') return false;
  return ref.length > 0 && item.length > 0;
}

export function isItemGridMultiActivateRef(
  value: unknown,
): value is ItemGridMultiActivateRef {
  if (!value || typeof value !== 'object') return false;
  if ('ref' in (value as Record<string, unknown>)) return false;

  const item = (value as { item?: unknown }).item;
  const activateAlso = (value as { activateAlso?: unknown }).activateAlso;
  const title = (value as { title?: unknown }).title;

  if (typeof item !== 'string' || item.length === 0) return false;
  if (
    !Array.isArray(activateAlso) ||
    !activateAlso.every(
      (candidate) => typeof candidate === 'string' && candidate.length > 0,
    )
  ) {
    return false;
  }
  if (title !== undefined && typeof title !== 'string') return false;

  return true;
}

export function isItemGridEmptyRef(value: unknown): value is ItemGridEmptyRef {
  if (!value || typeof value !== 'object') return false;
  return (value as { empty?: unknown }).empty === true;
}

export function resolveItemGridRef(
  value: unknown,
  resolveStringRef: (itemId: string) => string | null,
  resolveEmptyRef: () => string | null = () => null,
): string | null {
  if (typeof value === 'string') return resolveStringRef(value);
  if (isItemGridEmptyRef(value)) return resolveEmptyRef();
  if (!isItemGridOrRef(value)) return null;
  for (const candidate of value.or) {
    const resolved = resolveItemGridRef(
      candidate,
      resolveStringRef,
      resolveEmptyRef,
    );
    if (resolved) return resolved;
  }
  return null;
}
