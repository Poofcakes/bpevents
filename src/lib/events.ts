

export interface GameEvent {
  name: string;
  type: 'World Boss' | 'Special Event' | 'Leisure Activity' | 'Unlock';
  category: 'Boss' | 'World Boss Crusade' | 'Buff' | 'Social' | 'Mini-game' | 'Patrol' | 'Guild' | 'Event' | 'Hunting' | 'Dungeon Unlock' | 'Raid Unlock' | 'Roguelike';
  seasonalCategory?: 'Silverstar Carnival' | 'Halloween' | 'Kanamia Harvest Festival' | 'Winter Fest';
  description: string;
  schedule: Schedule;
  durationMinutes?: number;
  location?: { name: string; x: number; y: number };
  // For time-limited events only
  dateRange?: { start: string; end: string };
  dateRanges?: { start: string; end: string }[];
  // For permanent events - when they were added/removed from the game
  availability?: { added?: string; removed?: string };
  biWeeklyRotation?: 'even' | 'odd';
}

export type Schedule = 
  | { type: 'hourly'; minute: number }
  | { type: 'multi-hourly'; hours: number; offsetHours?: number, minute: number }
  | { type: 'daily-specific'; days: number[]; times: { hour: number; minute: number }[] }
  | { type: 'daily-intervals', intervals: { start: { hour: number, minute: number }, end: { hour: number, minute: number}}[] }
  | { type: 'daily-intervals-specific', days: number[], intervals: { start: { hour: number, minute: number }, end: { hour: number, minute: number}}[] }
  | { type: 'none' }; // For events that only have a date range

const spiritDanceTimes = [
  { hour: 10, minute: 44 },
  { hour: 11, minute: 9 },
  { hour: 13, minute: 56 },
  { hour: 14, minute: 20 },
  { hour: 17, minute: 8 },
  { hour: 17, minute: 32 },
  { hour: 20, minute: 20 },
  { hour: 20, minute: 44 },
  { hour: 23, minute: 32 },
  { hour: 0, minute: 56 }, 
];

const starlightFireworksTimes = [
    { hour: 0, minute: 20 },
    { hour: 0, minute: 44 },
    { hour: 1, minute: 8 },
    { hour: 1, minute: 32 },
    { hour: 1, minute: 56 },
];

export const events: GameEvent[] = [
  // Monster Hunts
  {
    name: 'Lovely Boarlet',
    type: 'World Boss',
    category: 'Boss',
    description: 'A special boarlet appears.',
    schedule: {
      type: 'daily-specific',
      days: [0, 1, 2, 3, 4, 5, 6],
      times: [
        { hour: 10, minute: 0 },
        { hour: 14, minute: 0 },
        { hour: 18, minute: 0 },
      ]
    },
  },
  {
    name: 'Breezy Boarlet',
    type: 'World Boss',
    category: 'Boss',
    description: 'A special boarlet appears.',
    schedule: {
      type: 'daily-specific',
      days: [0, 1, 2, 3, 4, 5, 6],
      times: [
        { hour: 12, minute: 0 },
        { hour: 16, minute: 0 },
        { hour: 20, minute: 0 },
      ]
    },
  },
  // Silverstar Carnival Events (Oct-Nov 2025)
  {
    name: 'Silverstar Carnival',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Silverstar Carnival',
    description: 'Main Event Track: Join events to gather Silver Star Badges.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-09',
      end: '2025-11-10'
    }
  },
  {
    name: 'Seabreeze (Login Rewards)',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Silverstar Carnival',
    description: 'Login Rewards: Gifts for 15 days login.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-16',
      end: '2025-11-10'
    }
  },
  {
    name: 'Spindrift Supply (Material Delivery)',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Silverstar Carnival',
    description: 'Material Delivery: Deliver daily life materials to earn Silver Star Badges.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-09',
      end: '2025-11-10'
    }
  },
  // Trials
  {
    name: "Dragon Shackles: Adept's Trial",
    type: 'Special Event',
    category: 'Roguelike',
    description: "Adept's Trial challenge. A roguelike event.",
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-23',
      end: '2025-11-07'
    }
  },
   {
    name: "Master's Trial: Scorching Warfare",
    type: 'Special Event',
    category: 'Event',
    description: "Master's Trial challenge.",
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-27',
      end: '2025-11-24'
    }
  },
  // Fireworks
  {
    name: 'Starlight Fireworks',
    type: 'Special Event',
    category: 'Social',
    seasonalCategory: 'Silverstar Carnival',
    description: 'A series of fireworks displays to celebrate the Silverstar Carnival.',
    schedule: { 
        type: 'daily-specific',
        days: [0,1,2,3,4,5,6], // Shows on all days it's active
        times: [ {hour: 1, minute: 0} ] // Placeholder time, actual times may vary per period
    },
    durationMinutes: 10,
    dateRanges: [
      { start: '2025-10-09', end: '2025-10-12' },
      { start: '2025-10-17', end: '2025-10-18' },
      { start: '2025-10-24', end: '2025-10-25' },
      { start: '2025-10-30', end: '2025-11-01' },
      { start: '2025-11-07', end: '2025-11-08' },
    ]
  },
  // Dungeon Unlocks
  {
    name: 'Goblin Lair Unlock',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'New area unlocked: Goblin Lair',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-09',
    }
  },
  {
    name: 'Towering Ruin Unlock',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'New area unlocked: Towering Ruin',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-13',
    }
  },
  {
    name: "Tina's Mindrealm Unlock",
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: "New area unlocked: Tina's Mindrealm",
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-11',
    }
  },
  {
    name: 'Kanamia Tribe Unlock',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'New area unlocked: Kanamia Tribe',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-15',
    }
  },
  {
    name: 'Dragon Claw Valley Unlock',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'New area unlocked: Dragon Claw Valley',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-17',
    }
  },
    {
    name: 'Dark Mist Fortress Unlock',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'New area unlocked: Dark Mist Fortress',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-19',
    }
  },
  // Deprecated Patrols
  {
    name: 'Ancient City Patrol',
    type: 'Leisure Activity',
    category: 'Patrol',
    description: 'Patrol the Ancient City. This patrol is no longer active.',
    schedule: {
        type: 'daily-specific',
        days: [0, 1, 2, 3, 4, 5, 6],
        times: [
            { hour: 15, minute: 15 },
            { hour: 20, minute: 15 },
            { hour: 1, minute: 15 },
        ]
    },
    durationMinutes: 30,
    availability: {
        added: '2025-10-13',
        removed: '2025-11-25'
    }
  },
  {
    name: 'Brigand Camp Patrol',
    type: 'Leisure Activity',
    category: 'Patrol',
    description: 'Patrol the Brigand Camp. This patrol is no longer active.',
    schedule: {
        type: 'daily-specific',
        days: [0, 1, 2, 3, 4, 5, 6],
        times: [
            { hour: 16, minute: 45 },
            { hour: 21, minute: 45 },
            { hour: 2, minute: 45 },
        ]
    },
    durationMinutes: 30,
    availability: {
        added: '2025-10-13',
        removed: '2025-11-25'
    }
  },
   {
    name: 'World Boss Crusade: Rathalos',
    type: 'World Boss',
    category: 'World Boss Crusade',
    description: 'Work together to defeat Rathalos.',
    schedule: {
      type: 'daily-intervals',
      intervals: [{ start: { hour: 16, minute: 0 }, end: { hour: 22, minute: 0 } }],
    },
    biWeeklyRotation: 'odd',
  },
  {
    name: 'World Boss Crusade: Byrnhald Golem',
    type: 'World Boss',
    category: 'World Boss Crusade',
    description: 'Work together to defeat Byrnhald Golem.',
    schedule: {
      type: 'daily-intervals',
      intervals: [{ start: { hour: 16, minute: 0 }, end: { hour: 22, minute: 0 } }],
    },
    biWeeklyRotation: 'even',
  },
  // Halloween Events
  {
    name: "Trickster's Candy Jar",
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Halloween',
    description: 'During the event, visit the Pumpkin Candy Jar at the Pioneer Bureau every day to claim "Mischief Candy" and Toy! Use the candies at the jar to exchange them for special rewards!',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-30',
      end: '2025-11-10'
    }
  },
  {
    name: "Nocturne Wardrobe",
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Halloween',
    description: 'Special Halloween-themed wardrobe items available.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-10-30',
      end: '2025-12-01'
    }
  },
  {
    name: 'Spirit Dance',
    type: 'Special Event',
    category: 'Social',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'Dance at the Sacred Grove.',
    schedule: {
      type: 'daily-specific',
      days: [5, 6, 0], // Fri, Sat, Sun
      times: spiritDanceTimes
    },
    durationMinutes: 10,
    dateRange: {
      start: '2025-12-05',
      end: '2025-12-29'
    }
  },
  {
    name: 'Harvest Feast (Buff Event)',
    type: 'Special Event',
    category: 'Buff',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'Buff Event: Gain unique buffs by tasting tribal delicacies.',
    schedule: { 
      type: 'daily-intervals',
      intervals: [
        { start: { hour: 0, minute: 0 }, end: { hour: 5, minute: 0 } },
        { start: { hour: 12, minute: 0 }, end: { hour: 17, minute: 0 } },
        { start: { hour: 18, minute: 0 }, end: { hour: 23, minute: 0 } },
      ],
    },
    dateRange: {
      start: '2025-12-05',
      end: '2026-01-16'
    }
  },
  {
    name: 'Loom of Dreams (Roguelike Event)',
    type: 'Special Event',
    category: 'Roguelike',
    description: 'Roguelike Event: A special event spanning several weeks.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-08',
      end: '2025-12-29'
    }
  },
  {
    name: 'Dance Novice',
    type: 'Leisure Activity',
    category: 'Social',
    description: 'Practice your moves and earn rewards.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [1, 3, 5, 0], // Mon, Wed, Fri, Sun
      intervals: [
        { start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 0 } },
        { start: { hour: 17, minute: 0 }, end: { hour: 18, minute: 0 } },
        { start: { hour: 20, minute: 0 }, end: { hour: 21, minute: 0 } },
        { start: { hour: 23, minute: 0 }, end: { hour: 0, minute: 0 } },
      ]
    },
  },
  {
    name: 'Morph Party (Social Event)',
    type: 'Special Event',
    category: 'Social',
    seasonalCategory: 'Winter Fest',
    description: 'Social Event: A special event where you can transform!',
    schedule: {
      type: 'daily-intervals',
      intervals: [
        { start: { hour: 3, minute: 0 }, end: { hour: 4, minute: 0 } },
        { start: { hour: 7, minute: 0 }, end: { hour: 8, minute: 0 } },
        { start: { hour: 11, minute: 0 }, end: { hour: 12, minute: 0 } },
        { start: { hour: 15, minute: 0 }, end: { hour: 16, minute: 0 } },
        { start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 0 } },
        { start: { hour: 23, minute: 0 }, end: { hour: 0, minute: 0 } },
      ],
    },
    dateRange: {
      start: '2025-12-18',
      end: '2026-01-05'
    }
  },
  {
    name: 'Snowman Strike! (Hunting Event)',
    type: 'Special Event',
    category: 'Hunting',
    seasonalCategory: 'Winter Fest',
    description: 'Hunting Event: Hunt Snow Nappo during the Winter Fest! Nappos spawn every 10 minutes during the 2-hour time periods. Limit: 100 snowballs during entire event, 20 snow gifts per week.',
    schedule: {
      type: 'daily-intervals',
      intervals: [
        { start: { hour: 3, minute: 0 }, end: { hour: 5, minute: 0 } }, // 03-05 UTC-2
        { start: { hour: 11, minute: 0 }, end: { hour: 13, minute: 0 } }, // 11-13 UTC-2
        { start: { hour: 19, minute: 0 }, end: { hour: 21, minute: 0 } }, // 19-21 UTC-2
      ]
    },
    durationMinutes: 120, // 2 hours per interval
    dateRanges: [
      { start: '2025-12-24', end: '2025-12-27' },
      { start: '2025-12-31', end: '2026-01-03' }
    ]
  },
  {
    name: 'New Year Fireworks Show',
    type: 'Special Event',
    category: 'Social',
    seasonalCategory: 'Winter Fest',
    description: 'Celebrate the New Year with spectacular fireworks displays!',
    schedule: {
      type: 'daily-specific',
      days: [0, 1, 2, 3, 4, 5, 6], // All days (filtered by dateRanges)
      times: [
        // Dec 31, 2025 times (game time UTC-2)
        { hour: 9, minute: 0 }, // 12:00 local
        { hour: 11, minute: 0 }, // 14:00 local
        { hour: 18, minute: 0 }, // 21:00 local
        { hour: 20, minute: 0 }, // 23:00 local
        { hour: 21, minute: 0 }, // 00:00 local (Jan 1)
        { hour: 22, minute: 0 }, // 01:00 local (Jan 1)
        // Jan 1, 2026 times (game time UTC-2)
        { hour: 1, minute: 0 },  // 04:00 local
        { hour: 3, minute: 0 },  // 06:00 local
        { hour: 4, minute: 0 },  // 07:00 local
        { hour: 6, minute: 0 },  // 09:00 local
      ]
    },
    durationMinutes: 8,
    location: { name: 'Asterleeds Beach', x: 0, y: 0 },
    dateRanges: [
      { start: '2025-12-31', end: '2025-12-31' },
      { start: '2026-01-01', end: '2026-01-01' }
    ]
  },
  {
    name: 'Ancestral Ash Pact (Exchange Event)',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'Exchange Event: Pact with the ancestors.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-05',
      end: '2025-12-29'
    }
  },
  {
    name: 'Trail of Legacy',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'Follow the trail of legacy.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-05',
      end: '2025-12-29'
    }
  },
  {
    name: "Time's Boon (Login Event)",
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'Login Event: A boon from time itself.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-05',
      end: '2025-12-29'
    }
  },
  {
    name: "Priest's Tally",
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Kanamia Harvest Festival',
    description: 'The priest\'s tally.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-05',
      end: '2025-12-29'
    }
  },
  {
    name: 'Winterfest Gift (Exchange Event)',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Winter Fest',
    description: 'Exchange Event: A gift for Winterfest.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-18',
      end: '2026-01-05'
    }
  },
  {
    name: 'Whimsical Winterfest',
    type: 'Special Event',
    category: 'Event',
    seasonalCategory: 'Winter Fest',
    description: 'Celebrate the Whimsical Winterfest. Different areas become available on different dates and remain available until the event ends.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2025-12-18',
      end: '2026-01-05'
    }
  },
  {
    name: 'Wasteland Race',
    type: 'Leisure Activity',
    category: 'Mini-game',
    description: 'Race across the wastelands.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [1, 3, 5, 0], // Mon, Wed, Fri, Sun
      intervals: [
        { start: { hour: 1, minute: 0 }, end: { hour: 2, minute: 0 } },
        { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } },
        { start: { hour: 15, minute: 0 }, end: { hour: 16, minute: 0 } },
        { start: { hour: 18, minute: 0 }, end: { hour: 19, minute: 0 } },
        { start: { hour: 21, minute: 0 }, end: { hour: 22, minute: 0 } },
      ],
    },
  },
  {
    name: "Ee-chan, don't stare at me!",
    type: 'Leisure Activity',
    category: 'Mini-game',
    description: 'A playful game of hide-and-seek.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [1, 3, 5, 0], // Mon, Wed, Fri, Sun
      intervals: [
        { start: { hour: 2, minute: 0 }, end: { hour: 3, minute: 0 } },
        { start: { hour: 16, minute: 0 }, end: { hour: 17, minute: 0 } },
        { start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 0 } },
        { start: { hour: 22, minute: 0 }, end: { hour: 23, minute: 0 } },
      ],
    },
    availability: {
      added: '2025-11-25'
    }
  },
  {
    name: 'Muku Camp Patrol',
    type: 'Leisure Activity',
    category: 'Patrol',
    description: 'Patrol the Muku Camp for rewards.',
    schedule: {
      type: 'daily-specific',
      days: [0, 1, 2, 3, 4, 5, 6],
      times: [
        { hour: 13, minute: 45 },
        { hour: 18, minute: 45 },
        { hour: 23, minute: 45 },
      ]
    },
    durationMinutes: 30,
    availability: {
      added: '2025-10-13'
    }
  },
  {
    name: 'City Rally',
    type: 'Leisure Activity',
    category: 'Mini-game',
    description: 'A mounted rally through the city streets.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [2, 4, 6, 0], // Tue, Thu, Sat, Sun
      intervals: [
        { start: { hour: 1, minute: 0 }, end: { hour: 2, minute: 0 } },
        { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } },
        { start: { hour: 15, minute: 0 }, end: { hour: 16, minute: 0 } },
        { start: { hour: 18, minute: 0 }, end: { hour: 19, minute: 0 } },
        { start: { hour: 21, minute: 0 }, end: { hour: 22, minute: 0 } },
      ],
    },
    availability: {
      added: '2025-11-25'
    }
  },
  {
    name: 'Balloon Capture',
    type: 'Leisure Activity',
    category: 'Mini-game',
    description: 'Capture the balloons for points.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [2, 4, 6, 0], // Tue, Thu, Sat, Sun
      intervals: [
        { start: { hour: 2, minute: 0 }, end: { hour: 3, minute: 0 } },
        { start: { hour: 16, minute: 0 }, end: { hour: 17, minute: 0 } },
        { start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 0 } },
        { start: { hour: 22, minute: 0 }, end: { hour: 23, minute: 0 } },
      ],
    },
    availability: {
      added: '2025-11-25'
    }
  },
  {
    name: 'Street Theater',
    type: 'Leisure Activity',
    category: 'Social',
    description: 'Enjoy a theatrical performance.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [2, 4, 6, 0], // Tue, Thu, Sat, Sun
      intervals: [
        { start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 0 } },
        { start: { hour: 17, minute: 0 }, end: { hour: 18, minute: 0 } },
        { start: { hour: 20, minute: 0 }, end: { hour: 21, minute: 0 } },
        { start: { hour: 23, minute: 0 }, end: { hour: 0, minute: 0 } },
      ]
    },
  },
  {
    name: 'Guild Dance',
    type: 'Leisure Activity',
    category: 'Guild',
    description: 'Perform dance moves on the Guild stage to obtain rewards and boost your hunting comrades.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [5], // Friday
      intervals: [
        { start: { hour: 15, minute: 30 }, end: { hour: 3, minute: 30 } },
      ]
    },
  },
  {
    name: 'Guild Hunt',
    type: 'Leisure Activity',
    category: 'Guild',
    description: 'Team up with your Guild to kill bosses.',
    schedule: {
      type: 'daily-intervals-specific',
      days: [5, 6, 0], // Fri, Sat, Sun
      intervals: [
        { start: { hour: 14, minute: 0 }, end: { hour: 4, minute: 0 } },
      ]
    },
  },
  // Master Difficulty
  {
    name: 'Master Difficulty (6-10)',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'Master Difficulty levels 6-10 unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-11-24',
    }
  },
  {
    name: 'Master Difficulty (11-20)',
    type: 'Unlock',
    category: 'Dungeon Unlock',
    description: 'Master Difficulty levels 11-20 unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-12-08',
    }
  },
  // Raid Unlocks
  {
    name: 'Raid: Rin Izcorgiky (N/H)',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Dragon Shackles Raid: Rin Izcorgiky (Normal, Hard) unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-10-27',
    }
  },
  {
    name: 'Raid: Bone Xiolotl (N/H)',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Dragon Shackles Raid: Bone Xiolotl (Normal, Hard) unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-11-03',
    }
  },
  {
    name: 'Raid: Light Tonatiuh (N/H)',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Dragon Shackles Raid: Light Tonatiuh (Normal, Hard) unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-11-10',
    }
  },
  // Nightmare Difficulty
  {
    name: 'Nightmare: Rin Izcorgiky',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Nightmare Mode for Rin Izcorgiky unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-11-24',
    }
  },
  {
    name: 'Nightmare: Bone Xolotl',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Nightmare Mode for Bone Xolotl unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-12-01',
    }
  },
  {
    name: 'Nightmare: Light Tonatiuh',
    type: 'Unlock',
    category: 'Raid Unlock',
    description: 'Nightmare Mode for Light Tonatiuh unlocked.',
    schedule: { type: 'none' },
    availability: {
      added: '2025-12-08',
    }
  },
  // Future event
  {
    name: 'Prelude of Crimson',
    type: 'Special Event',
    category: 'Event',
    description: 'An unknown event. Details to be announced.',
    schedule: { type: 'none' },
    dateRange: {
      start: '2026-01-01',
      end: '2026-01-15'
    }
  },
];
