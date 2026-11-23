// =============================================================
// examples.js — a small starter pack, installed on first launch
// so the Tables tab isn't empty. Delete the folder whenever.
// Shows off the three features: ranges, [[nested]] and {dice}.
// =============================================================

export const EXAMPLES_PACK = {
  format: 'tabletop-kit-pack',
  version: 1,
  name: 'Examples',
  tables: [
    { name: 'Weather', folder: 'Examples', die: 'd6', notes: 'Basic ranges.', entries: [
      { min: 1, max: 2, text: 'Clear skies and a light breeze' },
      { min: 3, max: 4, text: 'Overcast, the smell of rain' },
      { min: 5, max: 5, text: 'Steady drizzle' },
      { min: 6, max: 6, text: 'A sudden storm rolls in' },
    ] },
    { name: 'Tavern', folder: 'Examples', die: 'auto', notes: 'A generator: one entry built from other tables.', entries: [
      { min: 1, max: 1, text: 'The [[Tavern Word A]] [[Tavern Word B]] ({1d6+1} patrons tonight)' },
    ] },
    { name: 'Tavern Word A', folder: 'Examples', die: 'auto', entries: [
      'Gilded', 'Sleepy', 'Crooked', 'Drowned', 'Laughing', 'Copper', 'Wandering', 'Hollow',
    ].map((t, i) => ({ min: i + 1, max: i + 1, text: t })) },
    { name: 'Tavern Word B', folder: 'Examples', die: 'auto', entries: [
      'Lantern', 'Goose', 'Anchor', 'Kettle', 'Fox', 'Barrel', 'Moth', 'Crown',
    ].map((t, i) => ({ min: i + 1, max: i + 1, text: t })) },
  ],
};
