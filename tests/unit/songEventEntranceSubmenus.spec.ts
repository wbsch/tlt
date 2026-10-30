import { describe, expect, it } from 'vitest';
import { OOTMM_MAP_DEFS } from '../../packs/ootmm/src/data/maps';

const GREAT_FAIRY_SONG_EVENTS = [
  { entranceId: 'OOT_FAIRY_FARORE', eventId: 5 },
  { entranceId: 'OOT_FAIRY_DIN', eventId: 6 },
  { entranceId: 'OOT_FAIRY_NAYRU', eventId: 7 },
  { entranceId: 'OOT_FAIRY_MAGIC', eventId: 8 },
  { entranceId: 'OOT_FAIRY_MAGIC2', eventId: 9 },
  { entranceId: 'OOT_FAIRY_DEFENSE', eventId: 10 },
];

describe('Great Fairy song events', () => {
  it.each(GREAT_FAIRY_SONG_EVENTS)(
    'belongs to the $entranceId entrance submenu',
    ({ entranceId, eventId }) => {
      const entranceMarkers = OOTMM_MAP_DEFS.flatMap((mapDef) =>
        mapDef.markers.filter((marker) =>
          marker.entranceMenu?.entranceIds.includes(entranceId),
        ),
      );

      expect(entranceMarkers).toHaveLength(1);
      expect(entranceMarkers[0]?.markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            songEventMenu: { eventId, game: 'oot' },
          }),
        ]),
      );
    },
  );

  it('does not keep Great Fairy song events as standalone map markers', () => {
    const standaloneEventIds = OOTMM_MAP_DEFS.flatMap((mapDef) =>
      mapDef.markers.flatMap((marker) =>
        marker.songEventMenu?.game === 'oot' &&
        GREAT_FAIRY_SONG_EVENTS.some(
          (entry) => entry.eventId === marker.songEventMenu?.eventId,
        )
          ? [marker.songEventMenu.eventId]
          : [],
      ),
    );

    expect(standaloneEventIds).toEqual([]);
  });
});
