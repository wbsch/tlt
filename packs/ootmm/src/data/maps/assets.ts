import type { MapMarkerOverlay } from './types';
import { withBasePath } from '../../utils/assetPath';

const MAP_IMAGE_BASE = withBasePath('images/maps');
const MAP_ICON_BASE = withBasePath('images/map_icons');
const OVERLAY_BASE = withBasePath('images/attributes');
const OVERLAY_WIDE_BASE = withBasePath('images/attributes_wide');
const NUMBER_BASE = withBasePath('images/numbers');
const MASTER_QUEST_LABEL_IMAGE = withBasePath('images/label_master_quest.png');

export function resolveMapImage(image: string): string {
  return `${MAP_IMAGE_BASE}/${image}.png`;
}

export function resolveMarkerImage(image: string): string {
  return `${MAP_ICON_BASE}/${image}.png`;
}

export function resolveOverlayImage(overlay: MapMarkerOverlay): string {
  if (overlay === 'broken') {
    return `${OVERLAY_BASE}/broken_actor.png`;
  }
  if (overlay === 'jp_only' || overlay === 'na_only') {
    return `${OVERLAY_WIDE_BASE}/${overlay}.png`;
  }
  return `${OVERLAY_BASE}/${overlay}.png`;
}

export function resolveDayComboOverlayImage(
  first: 'day1' | 'day2' | 'day3',
  second: 'day1' | 'day2' | 'day3',
): string | null {
  const key = [first, second].sort().join('+');
  const byPair: Record<string, string> = {
    'day1+day2': 'day1_and_2',
    'day1+day3': 'day1_and_3',
    'day2+day3': 'day2_and_3',
  };
  const file = byPair[key];
  return file ? `${OVERLAY_WIDE_BASE}/${file}.png` : null;
}

export function resolveDigitImage(digit: string): string {
  return `${NUMBER_BASE}/${digit}.png`;
}

export function resolveMasterQuestLabelImage(): string {
  return MASTER_QUEST_LABEL_IMAGE;
}
