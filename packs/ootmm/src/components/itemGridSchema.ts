import type { CSSProperties, InjectionKey } from 'vue';
import type { ItemGridRef } from '../utils/itemGridRef';

export const EMPTY_GRID_ITEM_ID = '__grid_empty__';

export type ItemGridSlot = ItemGridRef;

export interface GridItem {
  type: 'item';
  item: string;
  margin?: string;
  width?: number;
  height?: number;
  canvas_depth?: number;
  canvas_left?: number;
  canvas_top?: number;
}

export interface GridCanvas {
  type: 'canvas';
  width: number;
  height: number;
  margin?: string;
  scale?: number;
  content: GridItem[];
}

export interface ItemGrid {
  type: 'itemgrid';
  h_alignment?: string;
  item_margin?: string;
  item_size?: number;
  scale?: number;
  rows: ItemGridSlot[][];
}

export interface GridArray {
  type: 'array';
  orientation: 'vertical' | 'horizontal';
  wrap?: boolean;
  margin?: string;
  scale?: number;
  content: GridNode[];
}

export interface GridSection {
  type: 'section';
  title?: string;
  orientation?: 'vertical' | 'horizontal';
  margin?: string;
  padding?: string;
  scale?: number;
  content: GridNode[];
}

export type GridNode =
  | GridItem
  | GridCanvas
  | ItemGrid
  | GridArray
  | GridSection;

export interface ResolvedItemGrid extends Omit<ItemGrid, 'rows'> {
  rows: string[][];
}

export interface ResolvedGridArray extends Omit<GridArray, 'content'> {
  content: ResolvedGridNode[];
}

export interface ResolvedGridSection extends Omit<GridSection, 'content'> {
  content: ResolvedGridNode[];
}

export type ResolvedGridNode =
  | GridItem
  | GridCanvas
  | ResolvedItemGrid
  | ResolvedGridArray
  | ResolvedGridSection;

export interface GridItemRefAlias {
  item: string;
  title?: string;
}

export interface GridItemMultiActivation {
  item: string;
  title?: string;
  activateAlso: string[];
}

export interface GridItemSubmenuConfig {
  item: string;
  title?: string;
  submenu: ResolvedGridNode;
}

export interface ItemGridRenderContext {
  parseMargin: (margin?: string) => { x: number; y: number };
  getArrayStyle: (element: GridArray) => CSSProperties;
  getSectionStyle: (element: GridSection) => CSSProperties;
  getItemStyle: (element: GridItem, parentScale: number) => CSSProperties;
  getCanvasStyle: (element: GridCanvas, parentScale: number) => CSSProperties;
  getGridItemStyle: (
    itemMargin: { x: number; y: number },
    itemSize: number,
  ) => CSSProperties;
  getGridItemClasses: (itemId: string) => Record<string, boolean>;
  getGridItemTitle: (itemId: string) => string;
  isEmptyGridItem: (itemId: string) => boolean;
  isSubmenuItem: (itemId: string) => boolean;
  isSubmenuOpen: (itemId: string) => boolean;
  getSubmenuNode: (itemId: string) => ResolvedGridNode | null;
  toggleItem: (itemId: string) => void;
  decrementItem: (itemId: string, event: MouseEvent) => void;
  handleItemWheel: (itemId: string, event: WheelEvent) => void;
  getIconSrc: (itemId: string) => string;
  getItemTextLabel: (itemId: string) => string | null;
  getOverlaySrc: (itemId: string) => string | null;
  getWheelOverlaySrc: (itemId: string) => string | null;
  getWheelOverlayText: (itemId: string) => string | null;
  isItemIconDisabled: (itemId: string) => boolean;
  shouldShowItemCount: (itemId: string) => boolean;
  getGridItemCount: (itemId: string) => number;
  handleImageError: (event: Event) => void;
  handleOverlayError: (event: Event) => void;
}

export const itemGridRenderContextKey: InjectionKey<ItemGridRenderContext> =
  Symbol('itemGridRenderContext');
