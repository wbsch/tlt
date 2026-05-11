import type { MapMarkerOverlay } from './types';
import { withBasePath } from '../../utils/assetPath';

const MASTER_QUEST_LABEL_IMAGE = withBasePath('images/label_master_quest.png');

export function resolveMapImage(image: string): string {
  return withBasePath(`images/maps/${image}.png`);
}

export function resolveMarkerImage(image: string): string {
  return withBasePath(`images/map_icons/${image}.png`);
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
