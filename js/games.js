// =============================================================
// games.js — game modules you can switch on and off
// -------------------------------------------------------------
// Each game-specific feature (Apothecaria now; Shadowdark, Iron
// Valley… later) gets an entry here. Settings → Game modules shows
// a toggle per entry, and the module's tab only appears when on.
// Stored in state.settings.games = { apothecaria: true, … }.
// =============================================================

import { state } from './state.js';

export const GAMES = [
  { id: 'apothecaria', name: 'Apothecaria', icon: '🌿',
    desc: 'Patients, foraging, brewing, reputation and calendar; reagent and ailment library you paste from your book.' },
];

/** Is this game module switched on? */
export const gameOn = (id) => !!state.settings.games?.[id];
