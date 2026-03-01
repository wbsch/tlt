export type MapMarkerOverlay =
  | 'child'
  | 'adult'
  | 'jp_only'
  | 'na_only'
  | 'day1'
  | 'day2'
  | 'day3'
  | 'night'
  | 'day'
  | 'clear_state'
  | 'cursed_state'
  | 'broken';

export type MapMarkerSettingExpectedValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

export type MapMarkerSettingsVisibility = {
  settings?: Record<string, MapMarkerSettingExpectedValue>;
  contains?: Record<string, MapMarkerSettingExpectedValue>;
  notContains?: Record<string, MapMarkerSettingExpectedValue>;
  and?: MapMarkerSettingsVisibility[];
  or?: MapMarkerSettingsVisibility[];
};

export type MapSubmenuEntryDef = {
  image: string;
  overlays?: MapMarkerOverlay[];
  codes: string | string[];
  visibleWhen?: MapMarkerSettingsVisibility;
};

export type MapDungeonEntranceMenuDef = {
  entranceIds: string[];
};

export type MapMarkerDef = {
  coords: [number, number];
  image: string;
  overlays?: MapMarkerOverlay[];
  type?: 'check' | 'submenu' | 'entrance-menu';
  codes?: string | string[];
  markers?: MapSubmenuEntryDef[];
  entranceMenu?: MapDungeonEntranceMenuDef;
  visibleWhen?: MapMarkerSettingsVisibility;
};

export type MapDef = {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  markers: MapMarkerDef[];
};

export type MarkerVisibilityMode = 'reachable-unchecked' | 'reachable-any';

export type MapMarkerViewModel = {
  id: string;
  coords: [number, number];
  image: string;
  overlays: MapMarkerOverlay[];
  type: 'check' | 'submenu' | 'entrance-menu';
  codes?: string | string[];
  reachableCount: number;
  checkedCount: number;
  isVisible: boolean;
};

export type MapPopupEntry = {
  id: string;
  code: string;
  checkId: string | null;
  isReachable: boolean;
  isChecked: boolean;
};

export type MapPopupPayload = {
  markerId: string;
  title: string;
  entries: MapPopupEntry[];
  canMarkAll: boolean;
  markAllAffectsReachableOnly: boolean;
};
