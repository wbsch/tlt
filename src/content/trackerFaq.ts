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
      'These answers cover the normal flow for using the tracker during a seed.',
    items: [
      {
        id: 'how-to-start',
        question: 'How should I use the tracker during a run?',
        defaultOpen: true,
        blocks: [
          {
            type: 'paragraph',
            text: 'Start by checking your settings and tricks before you begin tracking items. The tracker uses those choices to decide which locations are reachable.',
          },
          {
            type: 'list',
            items: [
              'Use Settings to mirror your seed options and apply any changes.',
              'Use Inventory and Items to record what you have already found.',
              'Use the map and the Locations sidebar to see what is currently reachable and what has already been collected.',
            ],
          },
          {
            type: 'paragraph',
            text: 'As soon as you update your inventory or mark a location, the tracker recalculates reachability automatically.',
          },
        ],
      },
      {
        id: 'stats-meaning',
        question: 'What do reachable, checked, and remaining mean?',
        blocks: [
          {
            type: 'list',
            items: [
              'Reachable shows how many checks the current logic says you can access right now.',
              'Checked shows how many locations you have already marked as collected or cleared.',
              'Remaining shows how many trackable locations are still open overall.',
            ],
          },
          {
            type: 'paragraph',
            text: 'If a count looks wrong, verify your settings, tricks, entrance mappings, and whether a location is hidden by a filter.',
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
              'World, Inventory, and Items give you alternate ways to update progression without leaving the tracker page.',
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
    ],
  },
  {
    id: 'advanced',
    title: 'Special Questions',
    description:
      'These topics cover the cases that usually need an extra explanation.',
    items: [
      {
        id: 'spoiler-log',
        question: 'Can I import a spoiler log?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Yes. The tracker supports spoiler log import, including drag-and-drop. That is useful if you want to preload placements, settings, or other seed information that the tracker can represent.',
          },
          {
            type: 'paragraph',
            text: 'If some values cannot be imported exactly, the tracker keeps working and shows Import Details so you can see what was ignored or adjusted.',
          },
        ],
      },
      {
        id: 'entrance-rando',
        question: 'How do entrance mappings affect reachability?',
        blocks: [
          {
            type: 'paragraph',
            text: 'When supported entrance shuffle options are active, the tracker needs the discovered mappings to evaluate access correctly. Unknown or incomplete mappings can make locations stay unreachable until you enter the information.',
          },
          {
            type: 'list',
            items: [
              'Record discovered entrances in the Entrances sidebar as you find them.',
              'Re-check reachability after updating a mapping, because the logic can unlock several regions at once.',
              'Only the supported entrance shuffle options are represented directly in this tracker.',
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
            text: 'Use Export State in the header. The tracker copies a shareable URL to your clipboard.',
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
            text: 'In almost every case, the cause is missing context rather than a display issue. The logic depends on your current settings, tricks, found items, and known entrance mappings.',
          },
          {
            type: 'list',
            items: [
              'Check whether the required item, song, event, or entrance mapping has been entered.',
              'Confirm that your settings and enabled tricks still match the seed you are playing.',
              'Look at active filters in Locations or Entrances, because hidden checks may still exist but not be visible in the current view.',
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
            text: 'Use Undo or Redo when you only need to step back a few actions. If the entire state is no longer trustworthy, Reset Tracker State clears the current progress and reloads the tracker.',
          },
          {
            type: 'paragraph',
            text: 'Because the tracker auto-saves, a full reset is the cleanest fallback when you want to restart from scratch in the same browser.',
          },
        ],
      },
    ],
  },
];
