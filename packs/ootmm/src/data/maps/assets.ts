import type { MapMarkerOverlay } from './types';
import { withBasePath } from '../../utils/assetPath';

const MASTER_QUEST_LABEL_IMAGE = withBasePath('images/label_master_quest.png');
const WALLMASTER_LABEL_IMAGE = withBasePath('images/speech_bubble.png');

export function resolveMapImage(image: string): string {
  return withBasePath(`images/maps/${image}.png`);
}

// BusinessAlex's map marker icons are opt-in: the default build substitutes the
// MIT-licensed fallback set. See LICENSE_ASSETS.md and the
// I_HAVE_ASKED_BUSINESSALEX_FOR_PERMISSION_FOR_THE_IMAGE_FILES build flag.
export const MAP_ICON_DIR = __TLT_USE_RESTRICTED_ASSETS__
  ? 'map_icons'
  : 'fallback/map_icons';

export function resolveMarkerImage(image: string): string {
  return withBasePath(`images/${MAP_ICON_DIR}/${image}.png`);
}

export function resolveOverlayImage(overlay: MapMarkerOverlay): string {
  if (overlay === 'broken') {
    return withBasePath('images/attributes/broken_actor.png');
  }
  if (overlay === 'jp_only' || overlay === 'na_only') {
    return withBasePath(`images/attributes_wide/${overlay}.png`);
  }
  return withBasePath(`images/attributes/${overlay}.png`);
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
  return file ? withBasePath(`images/attributes_wide/${file}.png`) : null;
}

export function resolveDigitImage(digit: string): string {
  return withBasePath(`images/numbers/${digit}.png`);
}

export function resolveMasterQuestLabelImage(): string {
  return MASTER_QUEST_LABEL_IMAGE;
}

export function resolveWallmasterLabelImage(): string {
  return WALLMASTER_LABEL_IMAGE;
}
