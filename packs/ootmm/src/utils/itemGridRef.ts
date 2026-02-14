export interface ItemGridOrRef {
  or: string[]
}

export type ItemGridRef = string | ItemGridOrRef

export function isItemGridOrRef(value: unknown): value is ItemGridOrRef {
  if (!value || typeof value !== 'object') return false
  const orValues = (value as { or?: unknown }).or
  return Array.isArray(orValues) && orValues.every((candidate) => typeof candidate === 'string')
}

export function resolveItemGridRef(
  value: unknown,
  exists: (itemId: string) => boolean,
): string | null {
  if (typeof value === 'string') return exists(value) ? value : null
  if (!isItemGridOrRef(value)) return null
  for (const candidate of value.or) {
    if (exists(candidate)) return candidate
  }
  return null
}
