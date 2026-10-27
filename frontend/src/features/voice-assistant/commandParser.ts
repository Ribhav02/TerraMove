import type { CommandIntent } from './types';

export const SECTOR17_LOCATIONS = [
  {
    name: 'Sector 17 Central Plaza',
    aliases: ['plaza', 'central plaza', 'main plaza', 'fountain', 'sector 17 plaza', 'city center'],
    lat: 30.7410,
    lon: 76.7820,
  },
  {
    name: 'Bank Square (SCO 1-20)',
    aliases: ['bank square', 'bank', 'sbi', 'banks', 'square', 'financial'],
    lat: 30.7415,
    lon: 76.7870,
  },
  {
    name: 'Neelam Cinema Corridor',
    aliases: ['neelam cinema', 'neelam', 'cinema', 'theatre', 'theater', 'movie'],
    lat: 30.7395,
    lon: 76.7810,
  },
  {
    name: 'ISBT Sector 17 Bus Terminal',
    aliases: ['isbt', 'bus stand', 'bus stop', 'bus terminal', 'isbt 17', 'bus'],
    lat: 30.7350,
    lon: 76.7800,
  },
  {
    name: 'KC Theatre Commercial Block',
    aliases: ['kc theatre', 'kc theater', 'kc', 'kc commercial'],
    lat: 30.7420,
    lon: 76.7845,
  },
  {
    name: 'Sector 17 North Gate / Garden',
    aliases: ['north gate', 'rose garden', 'shanti kunj', 'garden', 'north park', 'park'],
    lat: 30.7455,
    lon: 76.7805,
  },
];

export function parseVoiceCommand(text: string): CommandIntent {
  const normalized = text.toLowerCase().trim();

  // 1. Stop / Mute commands
  if (
    normalized === 'stop' ||
    normalized.includes('stop speaking') ||
    normalized.includes('be quiet') ||
    normalized.includes('shut up') ||
    normalized.includes('silence') ||
    normalized.includes('cancel')
  ) {
    return { type: 'STOP_SPEAKING', rawText: text };
  }

  // 2. Weather & Heat Index inquiries
  if (
    normalized.includes('weather') ||
    normalized.includes('temperature') ||
    normalized.includes('heat index') ||
    normalized.includes('how hot') ||
    normalized.includes('apparent temp') ||
    normalized.includes('humidity') ||
    normalized.includes('uv index')
  ) {
    return { type: 'CHECK_WEATHER', rawText: text };
  }

  // 3. Explain which route is best for reducing heat exposure
  if (
    normalized.includes('explain') ||
    normalized.includes('which route is best') ||
    normalized.includes('best route for heat') ||
    normalized.includes('reduce heat') ||
    normalized.includes('reducing heat') ||
    normalized.includes('heat advice') ||
    normalized.includes('heat advisory') ||
    normalized.includes('why shadiest') ||
    normalized.includes('thermal strain')
  ) {
    return { type: 'EXPLAIN_HEAT', rawText: text };
  }

  // 4. Shadiest Route
  if (
    normalized.includes('shadiest') ||
    normalized.includes('shady') ||
    normalized.includes('shade') ||
    normalized.includes('cooler route') ||
    normalized.includes('cool route') ||
    normalized.includes('sun protected')
  ) {
    return { type: 'ROUTE_SHADIEST', rawText: text };
  }

  // 5. Fastest Route
  if (
    normalized.includes('fastest') ||
    normalized.includes('quickest') ||
    normalized.includes('shortest time') ||
    normalized.includes('direct route') ||
    normalized.includes('speed')
  ) {
    return { type: 'ROUTE_FASTEST', rawText: text };
  }

  // 6. Balanced Route
  if (
    normalized.includes('balanced') ||
    normalized.includes('optimal') ||
    normalized.includes('compromise') ||
    normalized.includes('mix of time and shade')
  ) {
    return { type: 'ROUTE_BALANCED', rawText: text };
  }

  // 7. Parking inquiries
  if (
    normalized.includes('parking') ||
    normalized.includes('park') ||
    normalized.includes('parking space') ||
    normalized.includes('where to park')
  ) {
    return { type: 'FIND_PARKING', rawText: text };
  }

  // 8. Navigation & Destination matching
  const navTriggers = ['go to', 'navigate to', 'take me to', 'route to', 'walk to', 'head to', 'destination'];
  const hasNavTrigger = navTriggers.some((t) => normalized.includes(t));

  for (const loc of SECTOR17_LOCATIONS) {
    const matched = loc.aliases.some((alias) => normalized.includes(alias));
    if (matched) {
      return {
        type: 'SET_DESTINATION',
        rawText: text,
        targetLocation: {
          name: loc.name,
          lat: loc.lat,
          lon: loc.lon,
        },
      };
    }
  }

  // Ambiguous destination check
  if (hasNavTrigger || normalized.includes('take me') || normalized.includes('navigate')) {
    return {
      type: 'CLARIFY',
      rawText: text,
      clarificationMessage:
        'Which destination in Sector 17 would you like to navigate to? You can say Central Plaza, Bank Square, Neelam Cinema, ISBT Bus Stand, or KC Theatre.',
    };
  }

  // Compare routes fallback
  if (normalized.includes('route') || normalized.includes('path') || normalized.includes('compare')) {
    return { type: 'COMPARE_ROUTES', rawText: text };
  }

  return { type: 'UNKNOWN', rawText: text };
}

