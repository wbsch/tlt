export interface ItemGridOrRef {
  or: string[]
}

export interface ItemGridAliasRef {
  ref: string
  item: string
  title?: string
}

export type ItemGridRef = string | ItemGridOrRef | ItemGridAliasRef

export function isItemGridOrRef(value: unknown): value is ItemGridOrRef {
  if (!value || typeof value !== 'object') return false
  const orValues = (value as { or?: unknown }).or
  return Array.isArray(orValues) && orValues.every((candidate) => typeof candidate === 'string')
}

export function isItemGridAliasRef(value: unknown): value is ItemGridAliasRef {
  if (!value || typeof value !== 'object') return false
  const ref = (value as { ref?: unknown }).ref
  const item = (value as { item?: unknown }).item
  const title = (value as { title?: unknown }).title
  if (typeof ref !== 'string' || typeof item !== 'string') return false
  if (title !== undefined && typeof title !== 'string') return false
  return ref.length > 0 && item.length > 0
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
