// =============================================================
// decks.js — card decks that remember what's been drawn
// -------------------------------------------------------------
// Unlike dice, a deck has memory: a drawn card is gone until you
// shuffle it back. Apothecaria-style games depend on this.
//
// Saved state per deck (state.decks[deckId]):
//   { draw: [cardId…],                 // face-down pile, top = end
//     discard: [{ id, rev }…],         // drawn cards, newest last
//     built: 'signature' }             // detects when settings change
//
// Card ids: playing cards are like "S1" (Ace♠) … "H13" (King♥),
// "JR"/"JB" for jokers. Tarot ids come from data/tarot.js.
// =============================================================

import { state, save, emit } from './state.js';
import { shuffle, coin } from './rng.js';
import { TAROT, TAROT_BY_ID } from './data/tarot.js';

// ---------- playing cards ----------
const SUIT_INFO = {
  S: { name: 'Spades', sym: '♠', red: false },
  H: { name: 'Hearts', sym: '♥', red: true },
  D: { name: 'Diamonds', sym: '♦', red: true },
  C: { name: 'Clubs', sym: '♣', red: false },
};
const RANK_NAMES = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
const RANK_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Describe a playing card id for display. */
export function playingCard(id) {
  if (id === 'JR') return { id, name: 'Red Joker', short: '🃏', red: true, joker: true };
  if (id === 'JB') return { id, name: 'Black Joker', short: '🃏', red: false, joker: true };
  const s = SUIT_INFO[id[0]];
  const r = parseInt(id.slice(1), 10);
  return { id, name: `${RANK_NAMES[r]} of ${s.name}`, short: `${RANK_SHORT[r]}${s.sym}`,
    red: s.red, suit: s.name, rank: r, joker: false };
}

// ---------- deck definitions ----------
// Each definition knows how to list its cards given the settings.
// To add a new kind of deck later, add an entry here.
export const DECKS = {
  standard: {
    name: 'Playing cards',
    cards: () => {
      const ids = [];
      for (const s of 'SHDC') for (let r = 1; r <= 13; r++) ids.push(`${s}${r}`);
      if (state.settings.jokers) ids.push('JR', 'JB');
      return ids;
    },
    signature: () => `std-${state.settings.jokers}`,
    reversible: () => false,
  },
  tarot: {
    name: 'Tarot',
    cards: () => TAROT.map((c) => c.id),
    signature: () => 'tarot-78',
    reversible: () => state.settings.tarotReversals,
  },
};

/** Get (and lazily create/rebuild) a deck's saved piles. */
export function deckState(deckId) {
  const def = DECKS[deckId];
  let d = state.decks[deckId];
  // Rebuild if new, or if a setting (like jokers) changed the card list.
  if (!d || d.built !== def.signature()) {
    d = { draw: shuffle(def.cards()), discard: [], built: def.signature() };
    state.decks[deckId] = d;
    save('decks');
  }
  return d;
}

/**
 * Draw `n` cards. If the pile runs out mid-draw, the discards are
 * shuffled back in automatically (the result says so).
 * Returns { cards: [{ id, rev }], reshuffled: bool }
 */
export function draw(deckId, n = 1) {
  const def = DECKS[deckId];
  const d = deckState(deckId);
  const cards = [];
  let reshuffled = false;
  for (let i = 0; i < n; i++) {
    if (!d.draw.length) {
      // Only shuffle back cards that aren't part of this very draw.
      const keep = new Set(cards.map((c) => c.id));
      d.draw = shuffle(d.discard.filter((c) => !keep.has(c.id)).map((c) => c.id));
      d.discard = d.discard.filter((c) => keep.has(c.id));
      reshuffled = true;
      if (!d.draw.length) break; // every card is already out
    }
    const id = d.draw.pop();
    const card = { id, rev: def.reversible() ? coin() : false };
    d.discard.push(card);
    cards.push(card);
  }
  save('decks');
  emit();
  return { cards, reshuffled };
}

/** Shuffle every drawn card back in (fresh full deck). */
export function reshuffleAll(deckId) {
  const def = DECKS[deckId];
  state.decks[deckId] = { draw: shuffle(def.cards()), discard: [], built: def.signature() };
  save('decks');
  emit();
}

/** Put the most recently drawn card back and reshuffle the pile. */
export function returnLast(deckId) {
  const d = deckState(deckId);
  const last = d.discard.pop();
  if (!last) return null;
  d.draw.push(last.id);
  shuffle(d.draw);
  save('decks');
  emit();
  return last;
}

export function counts(deckId) {
  const d = deckState(deckId);
  return { left: d.draw.length, out: d.discard.length };
}

export { TAROT_BY_ID };
