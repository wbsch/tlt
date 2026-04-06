export type TrackerFaqContentBlock =
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'list';
      items: string[];
    };

export type TrackerFaqItem = {
  id: string;
  question: string;
  blocks: TrackerFaqContentBlock[];
  defaultOpen?: boolean;
};

export type TrackerFaqSection = {
  id: string;
  title: string;
  description?: string;
  items: TrackerFaqItem[];
};

export const TRACKER_FAQ_SECTIONS: TrackerFaqSection[] = [
  {
    id: 'basics',
    title: 'Getting Started',
    description:
      'These answers cover the typical workflow for using the tracker during a seed.',
    items: [
      {
        id: 'how-to-start',
        question: 'How should I use the tracker during a run?',
        defaultOpen: false,
        blocks: [
          {
            type: 'paragraph',
            text: 'Start by uploading your spoiler log via drag-and-drop anywhere, or configure your settings and tricks manually before you begin tracking items. The tracker uses these choices to determine which locations are reachable.',
          },
          {
            type: 'list',
            items: [
              "Click items in the Items or All Items tabs to record what you've found. Starting items from your spoiler log are pre-filled.",
              "Junk locations from your spoiler log are automatically marked as checked, so they won't appear when filtering for reachable, unchecked locations.",
              "Use the map and the Locations sidebar to view what is currently reachable and what you've already collected.",
              'The number next to region names in the map dropdown shows how many checks on that map are selected, based on your current filters (reachable, collected, etc.).',
            ],
          },
          {
            type: 'paragraph',
            text: 'When you update your inventory, the tracker automatically recalculates reachability.',
          },
        ],
      },
      {
        id: 'stats-meaning',
        question: 'What do reachable, checked and remaining mean?',
        blocks: [
          {
            type: 'list',
            items: [
              'Reachable shows how many checks the logic says you can access with your selected settings and items.',
              'Checked shows how many locations you have already marked as collected or cleared.',
              'Remaining shows how many trackable locations are still open overall.',
            ],
          },
        ],
      },
      {
        id: 'find-checks',
        question: 'Where can I find checks quickly?',
        blocks: [
          {
            type: 'paragraph',
            text: 'You can work from either the map or the sidebars. The map is best for area-based routing, while the sidebars are better for searching and filtering.',
          },
          {
            type: 'list',
            items: [
              'Locations lets you search by name and narrow the list by reachability, collection state, or category.',
              'Entrances helps you track shuffled connections when entrance randomizer options are active.',
            ],
          },
        ],
      },
      {
        id: 'auto-save',
        question: 'Is my progress saved automatically?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Yes. Tracker progress and most UI state are persisted in the browser automatically, so a reload or restart normally keeps your session intact.',
          },
          {
            type: 'paragraph',
            text: 'Use Export State if you want to move the tracker to another browser or share the current state with someone else.',
          },
        ],
      },
      {
        id: 'entrance-randomizer',
        question: 'How do I track entrances?',
        blocks: [
          {
            type: 'paragraph',
            text: 'When entrance randomizer options are active, you can track which entrance leads where via the map or the Entrances sidebar. Filters for mapped/unmapped and reachable/unreachable entrances are available.',
          },
          {
            type: 'paragraph',
            text: 'Similar to the items filter reachable shows which entrances can be accessed with your current settings and other discovered entrances. Unmapped entrances are those for which you have not yet entered a discovered connection, while mapped entrances already have a known destination.',
          },
          {
            type: 'paragraph',
            text: 'If an Entrance Randomizer option is selected, the number next to the check count in the map dropdown reflects the number of entrances based on your items, settings, and filters.',
          },
        ],
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Special Questions',
    description:
      'These topics cover cases that typically require extra explanation.',
    items: [
      {
        id: 'spoiler-log',
        question: 'Can I import a spoiler log?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Yes. The tracker supports spoiler log import, including drag-and-drop. This is useful for preloading placements, settings, or other seed information the tracker can represent.',
          },
          {
            type: 'paragraph',
            text: 'If some values cannot be imported exactly, the tracker continues to work and shows Import Details so you can see what was ignored or adjusted.',
          },
        ],
      },
      {
        id: 'entrance-rando',
        question: 'How do entrance mappings affect reachability?',
        blocks: [
          {
            type: 'paragraph',
            text: 'When supported entrance shuffle options are active, the tracker needs discovered mappings to evaluate access correctly. Unknown or incomplete mappings can keep locations unreachable until you enter the information.',
          },
          {
            type: 'list',
            items: [
              'Record discovered entrances in the Entrances sidebar as you find them.',
              'Re-check reachability after updating a mapping, since the logic can unlock several regions at once.',
              'Only supported entrance shuffle options are represented directly in this tracker.',
            ],
          },
        ],
      },
      {
        id: 'share-state',
        question: 'How can I share my tracker state?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Use Export State in the header; the tracker copies a shareable URL to your clipboard.',
          },
          {
            type: 'list',
            items: [
              'Export State shares your tracker without collected locations.',
              'The export menu also offers an option to include collected locations when you want a full progress snapshot.',
              'Opening that URL in the tracker imports the stored state into the browser.',
            ],
          },
        ],
      },
      {
        id: 'missing-reachability',
        question:
          'Why is a location not marked reachable even though I expect it to be?',
        blocks: [
          {
            type: 'paragraph',
            text: 'In most cases, the cause is missing context rather than a display issue. The logic depends on your current settings, enabled tricks, found items, and known entrance mappings.',
          },
          {
            type: 'list',
            items: [
              'Check whether the required item, song, event, or entrance mapping has been entered.',
              'Confirm that your settings and enabled tricks still match the seed you are playing.',
              'Check active filters in Locations or Entrances; hidden checks may exist but not be visible in the current view.',
            ],
          },
        ],
      },
      {
        id: 'undo-reset',
        question: 'What should I do after a misclick or a bad import?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Use Undo or Redo to step back a few actions. If the entire state is no longer trustworthy, Reset Tracker State clears current progress and reloads the tracker.',
          },
          {
            type: 'paragraph',
            text: 'Because the tracker auto-saves, a full reset is the cleanest fallback when restarting from scratch in the same browser.',
          },
        ],
      },
    ],
  },
];
