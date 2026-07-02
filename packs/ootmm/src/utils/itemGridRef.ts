import type { GridNode } from '../components/itemGridSchema';

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

export interface ItemGridSubmenuRef {
  ref: string;
  item: string;
  title?: string;
  submenu: GridNode;
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
  | ItemGridSubmenuRef
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
  if ('submenu' in (value as Record<string, unknown>)) return false;
  const ref = (value as { ref?: unknown }).ref;
  const item = (value as { item?: unknown }).item;
  const title = (value as { title?: unknown }).title;
  if (typeof ref !== 'string' || typeof item !== 'string') return false;
  if (title !== undefined && typeof title !== 'string') return false;
  return ref.length > 0 && item.length > 0;
}

export function isItemGridSubmenuRef(
  value: unknown,
): value is ItemGridSubmenuRef {
  if (!value || typeof value !== 'object') return false;

  const ref = (value as { ref?: unknown }).ref;
  const item = (value as { item?: unknown }).item;
  const title = (value as { title?: unknown }).title;
  const submenu = (value as { submenu?: unknown }).submenu;

  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (typeof item !== 'string' || item.length === 0) return false;
  if (title !== undefined && typeof title !== 'string') return false;

  return Boolean(submenu && typeof submenu === 'object');
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

/**
 * Collect all distinct item IDs referenced in an item grid JSON data structure.
 * Handles: plain strings, `{or:[...]}`, alias refs (`{ref,item}`),
 * submenu refs (`{ref,item,submenu}`), multi-activate refs (`{item,activateAlso}`),
 * and `{empty:true}` (skipped).
 */
export function collectAllGridItemIds(root: unknown): Set<string> {
  const ids = new Set<string>();

  function walkRef(ref: unknown) {
    if (typeof ref === 'string') {
      ids.add(ref);
    } else if (ref && typeof ref === 'object') {
      const obj = ref as Record<string, unknown>;
      // or-ref
      if ('or' in obj && Array.isArray(obj.or)) {
        for (const candidate of obj.or) {
          walkRef(candidate);
        }
      }
      // alias / submenu ref (has 'item' but not 'activateAlso')
      if ('item' in obj && typeof obj.item === 'string') {
        ids.add(obj.item);
      }
      // multi-activate (activateAlso)
      if ('activateAlso' in obj && Array.isArray(obj.activateAlso)) {
        for (const also of obj.activateAlso) {
          if (typeof also === 'string') ids.add(also);
        }
      }
      // submenu: walk its content too
      if ('submenu' in obj && obj.submenu) {
        walkNode(obj.submenu);
      }
    }
    // {empty:true} — intentionally ignored
  }

  function walkNode(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const type = obj.type;

    if (type === 'array' || type === 'section') {
      const content = obj.content;
      if (Array.isArray(content)) {
        for (const child of content) {
          walkNode(child);
        }
      }
    } else if (type === 'itemgrid') {
      const rows = obj.rows;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (Array.isArray(row)) {
            for (const slot of row) {
              walkRef(slot);
            }
          }
        }
      }
    }
  }

  if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      walkNode(obj[key]);
    }
  }

  return ids;
}
