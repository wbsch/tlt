export type TrackerFaqInlineContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'link';
      text: string;
      href: string;
    };

export type TrackerFaqRichText = string | TrackerFaqInlineContent[];

export type TrackerFaqContentBlock =
  | {
      type: 'paragraph';
      text: TrackerFaqRichText;
    }
  | {
      type: 'list';
      items: TrackerFaqRichText[];
    };

const WINDOWS_AUTOTRACKER_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest/download/ootmm-autotracker-v0.2.1-windows-amd64.exe';

const LINUX_AUTOTRACKER_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest/download/ootmm-autotracker-v0.2.1-linux-amd64';

const ADAPTER_LUA_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest/download/tlt_autotracking_v1.lua';

const GITHUB_REL_LATEST_URL =
  'https://github.com/jupiter0fire/tlt-autotracker/releases/latest';

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
        id: 'autotracking',
        question: 'How do I set up autotracking for Project64-EM?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Only randomizer version v30.1 is supported (no dev seeds). Autotracking only works after you import a spoiler log.',
          },
          {
            type: 'paragraph',
            text: [
              {
                type: 'text',
                text: 'Download the autotracker for ',
              },
              {
                type: 'link',
                text: 'Windows',
                href: WINDOWS_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' or ',
              },
              {
                type: 'link',
                text: 'Linux',
                href: LINUX_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' (for other versions see ',
              },
              {
                type: 'link',
                text: 'Github',
                href: GITHUB_REL_LATEST_URL,
              },
              {
                type: 'text',
                text: ') and also download the ',
              },
              {
                type: 'link',
                text: 'adapter Lua file',
                href: ADAPTER_LUA_URL,
              },
              {
                type: 'text',
                text: '. Put the adapter Lua in the same folder as the Multiworld/Coop Lua script, inside the Scripts folder of Project64-EM.',
              },
            ],
          },
          {
            type: 'list',
            items: [
              'Generate a seed and open it in Project64-EM.',
              'Start the autotracker.',
              'In Project64-EM, open File -> Lua Scripts and double-click tlt_autotracking_v1.lua.',
              'Upload the spoiler log to thelasttracker.org.',
              'If The Last Tracker does not connect automatically, click Auto. Check if the autotracker shows that it is connected to Project64 and the tracker.',
              'Potentially, your browser will display a popup regarding access to the autotracker. You need to grant access there once.',
              'The autotracker currently tracks items and locations, but not entrances, song events, or similar.',
            ],
          },
          {
            type: 'paragraph',
            text: 'A green outline around the Auto button means the autotracker connected successfully. An orange outline means no connection to the autotracker has been established yet.',
          },
        ],
      },
      {
        id: 'autotracking',
        question: 'How do I set up autotracking for RetroArch?',
        blocks: [
          {
            type: 'paragraph',
            text: 'Only randomizer version v30.1 is supported (no dev seeds). Autotracking only works after you import a spoiler log.',
          },
          {
            type: 'paragraph',
            text: [
              {
                type: 'text',
                text: 'Download the autotracker for ',
              },
              {
                type: 'link',
                text: 'Windows',
                href: WINDOWS_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' or ',
              },
              {
                type: 'link',
                text: 'Linux',
                href: LINUX_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' (for other versions see ',
              },
              {
                type: 'link',
                text: 'Github',
                href: GITHUB_REL_LATEST_URL,
              },
              {
                type: 'text',
                text: '). If this is your first time using autotracking, you have to enable network commands in RetroArch. Enable Show Advanced Settings under Settings -> User Interface. Then enable Network Commands under Settings -> Network and leave the Network Command Port set to 55355.',
              },
            ],
          },
          {
            type: 'list',
            items: [
              'Generate a seed and open it in RetroArch.',
              'Start the autotracker.',
              'Upload the spoiler log to thelasttracker.org.',
              'If The Last Tracker does not connect automatically, click Auto. Check if the autotracker shows that it is connected to RetroArch and the tracker.',
              'Potentially, your browser will display a popup regarding access to the autotracker. You need to grant access there once.',
              'The autotracker currently tracks items and locations, but not entrances, song events, or similar.',
            ],
          },
          {
            type: 'paragraph',
            text: 'A green outline around the Auto button means the autotracker connected successfully. An orange outline means no connection to the autotracker has been established yet.',
          },
        ],
      },
      {
        id: 'autotracking',
        question: 'How do I set up autotracking for Ares',
        blocks: [
          {
            type: 'paragraph',
            text: 'Only randomizer version v30.1 is supported (no dev seeds). Autotracking only works after you import a spoiler log.',
          },
          {
            type: 'paragraph',
            text: [
              {
                type: 'text',
                text: 'Download the autotracker for ',
              },
              {
                type: 'link',
                text: 'Windows',
                href: WINDOWS_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' or ',
              },
              {
                type: 'link',
                text: 'Linux',
                href: LINUX_AUTOTRACKER_URL,
              },
              {
                type: 'text',
                text: ' (for other versions see ',
              },
              {
                type: 'link',
                text: 'Github',
                href: GITHUB_REL_LATEST_URL,
              },
              {
                type: 'text',
                text: '). If this is your first time using autotracking, you have to enable GDB debugging in Ares. Toggle "Enabled" and "Use IPv4" under Settings -> Debug. Leave the Port set to 9123.',
              },
            ],
          },
          {
            type: 'list',
            items: [
              'Generate a seed and open it in Ares.',
              'Start the autotracker.',
              'Upload the spoiler log to thelasttracker.org.',
              'If The Last Tracker does not connect automatically, click Auto. Check if the autotracker shows that it is connected to Ares and the tracker.',
              'Potentially, your browser will display a popup regarding access to the autotracker. You need to grant access there once.',
              'The autotracker currently tracks items and locations, but not entrances, song events, or similar.',
            ],
          },
          {
            type: 'paragraph',
            text: 'A green outline around the Auto button means the autotracker connected successfully. An orange outline means no connection to the autotracker has been established yet. You cannot use the multiclient and autotracking at the same time, because Ares only allows one external connection',
          },
        ],
      },
      {
        id: 'autotracker-limitations',
        question: "What can't the autotracker cleanly detect?",
        blocks: [
          {
            type: 'list',
            items: [
              'The three checks "Zora River Bean Seller", "Market House Big Poes" and "Chest Game HP" cannot be cleanly tracked by the autotracker.',
              'The Goron Knife is not cleanly detected if you already have the Biggoron Sword.',
              'In Triforce Hunt mode, the autotracker cannot distinguish between the different Triforce Pieces.',
              'The last two limitations exist because the tracker sees the same information that the user sees in the in-game Inventory/Equipment screen.',
            ],
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
              'Record discovered entrances on the map or in the Entrances sidebar as you find them.',
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
            text: 'In most cases, the cause is missing context rather than a bug. The logic depends on your current settings, enabled tricks, found items, and known entrance mappings.',
          },
          {
            type: 'list',
            items: [
              'Check whether the required item, song, event, or entrance mapping has been entered.',
              'Confirm that your settings and enabled tricks still match the seed you are playing.',
              'Check active filters in Locations or Entrances; hidden checks may exist but not be visible in the current view.',
            ],
          },
          {
            type: 'paragraph',
            text: "If the check you're looking for still isn't marked as reachable, export your tracker state and post it in the #tracker-support channel on the OOTMM Discord, describing the issue.",
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
      {
        id: 'dungeon-layout',
        question: 'Can I put in the dungeon layout for dungeon rewards?',
        blocks: [
          {
            type: 'paragraph',
            text: 'If you import your spoiler log and selected "Dungeon Blue Warps" for Dungeon Reward Shuffle, the tracker will automatically populate the dungeon reward layouts from the log.',
          },
          {
            type: 'paragraph',
            text: 'If not, hover over a dungeon reward icon and use the scroll wheel (or trackpad gesture) to cycle through the available layouts. On mobile, long-press the icon to open a dungeon selection menu.',
          },
        ],
      },
      {
        id: 'older-spoiler-log',
        question:
          'What happens if I upload a spoiler log from an older version?',
        blocks: [
          {
            type: 'paragraph',
            text: 'If you upload a spoiler log from an older version that includes settings which no longer exist (e.g. Cross-Games MM Song of Soaring), the tracker converts those settings to their closest modern equivalents. Sometimes it also adds new items (e.g. OoT Song of Soaring, formerly part of Cross-Games) to accurately represent the older setup.',
          },
          {
            type: 'paragraph',
            text: 'You do not need to track those automatically-added items. In fact, the tracker prevents you from doing so. It handles everything behind the scenes. Simply continue tracking your items as you normally would.',
          },
        ],
      },
      {
        id: 'unsupported-randomizer-settings',
        question:
          'Which randomizer settings are not supported by thelasttracker.org?',
        blocks: [
          {
            type: 'paragraph',
            text: 'The tracker supports all options from the current Stable Randomizer version v31.1.',
          },
        ],
      },
    ],
  },
];
