// =============================================================
// letstalk.js — runs a LET'S TALK! dialogue with an NPC card
// -------------------------------------------------------------
// Stages: Greetings (attitude, topic, mood) → up to 3 Exchanges
// (draw 3 tone cards, pick one, roll a reaction) → Aftermath.
// The dialogue in progress is saved per campaign (state.dialogue),
// so closing the app mid-conversation doesn't lose it.
// Rules data: data/letstalk.js (credited there).
// =============================================================

import { state, save, emit } from './state.js';
import { rollDie, shuffle, uid } from './rng.js';
import { getNpc, updateNpc, attitudeName } from './npcs.js';
import {
  ATTITUDE_COLS, TOPICS, MOOD_GRID, MOOD_BY_ATTITUDE, REACTION_ROLL, LEVELS,
  BASE_TONES, REACTION_TABLE, MOOD_EFFECTS, attitudeGroup,
} from './data/letstalk.js';

const d = () => state.dialogue;
const clampAtt = (v) => Math.max(-2, Math.min(2, v));

// ---------------------------------------------------------------
// Greetings
// ---------------------------------------------------------------
export function rollTopic() {
  const r = rollDie(10);
  return { roll: r, text: TOPICS.find(([lo, hi]) => r >= lo && r <= hi)[2] };
}

/** method: 'random' (2d10 grid) | 'attitude' (1d10 in Attitude column) */
export function rollMood(method, attitude) {
  if (method === 'attitude') {
    const r = rollDie(10);
    return { name: MOOD_BY_ATTITUDE[attitudeName(attitude)][r - 1], rolls: `d10 ${r}`, method };
  }
  const row = rollDie(10), col = rollDie(10);
  return { name: MOOD_GRID[row - 1][Math.ceil(col / 2) - 1], rolls: `row ${row}, column ${col}`, method: 'random' };
}

/**
 * Start a dialogue.
 *   opts.topic: { by: 'you', text } or { by: 'npc' } (rolled)
 *   opts.mood:  { method: 'random'|'attitude'|'personality'|'pick', name? }
 */
export function startDialogue(npcId, opts) {
  const npc = getNpc(npcId);
  const social = state.social;
  const topic = opts.topic.by === 'npc' ? { by: 'npc', ...rollTopic() } : { by: 'you', text: opts.topic.text || 'Your topic' };
  let mood;
  if (opts.mood.method === 'pick' && opts.mood.name) mood = { name: opts.mood.name, method: 'pick', rolls: '' };
  else if (opts.mood.method === 'personality' && npc.mood) mood = { name: npc.mood, method: 'personality', rolls: '' };
  else mood = rollMood(opts.mood.method === 'attitude' ? 'attitude' : 'random', npc.attitude);

  // Build the Tone Deck.
  const deck = [...BASE_TONES];
  if (social.flirting && npc.attitude >= -1 && !npc.flirtCooldown) deck.push('Flirting');
  const inRomance = npc.kc?.stage === 'romance' || npc.romance;
  if (inRomance && !npc.romanceCooldown) deck.push('Romantic');
  const wild = social.wildcard;
  if (wild && deck.includes(wild)) deck.push('Wildcard');
  shuffle(deck);

  state.dialogue = {
    id: uid(), npcId, started: Date.now(),
    attitude: npc.attitude, topic, mood,
    options: { advancedMoods: social.advancedMoods, hardcore: social.hardcore, wildcard: wild, porting: social.porting !== false },
    deck, hand: [], exchange: 1, history: [],
    seen: [],               // reactions so far (effects change from the NEXT exchange)
    negotiator: 0,          // ±1 carried into the next exchange
    pragmaticUsed: { P: false, N: false },
    reshuffled: [],
    ended: false, endReason: '',
  };
  drawHand();
  save('dialogue'); emit();
  return state.dialogue;
}

function drawHand() {
  const dl = d();
  if (dl.options.hardcore && dl.exchange > 1) return; // hardcore: keep the first 3
  dl.hand = dl.deck.splice(0, 3);
}

// ---------------------------------------------------------------
// Mood effects
// ---------------------------------------------------------------
function effect() {
  const dl = d();
  return dl.options.advancedMoods ? MOOD_EFFECTS[dl.mood.name] || null : null;
}

/** Is the mood's effect switched on in this exchange? */
export function effectActive(n = d().exchange) {
  const e = effect();
  if (!e) return false;
  const seen = d().seen;
  if (e.exchanges && !e.exchanges.includes(n)) return false;
  if (e.until && seen.some((r) => e.until.includes(r))) return false;
  if (e.after && !seen.some((r) => e.after.includes(r))) return false;
  return true;
}

const toneOf = (card) => (card === 'Wildcard' ? d().options.wildcard : card);

/** Attitude step bonus/penalty for a tone this exchange. */
export function modifierFor(tone) {
  let mod = d().negotiator || 0;
  if (effectActive()) {
    const m = effect().mods || {};
    mod += (m.all || 0) + (m[tone] || 0);
  }
  return mod;
}

/** Why a card can't be played right now ('' if it can). */
export function unusableReason(card) {
  const tone = toneOf(card);
  const dl = d();
  if (!REACTION_TABLE[tone][attitudeGroup(dl.attitude)]) return `Not possible with someone ${attitudeName(dl.attitude)}`;
  if (effectActive() && (effect().restrict || []).includes(tone)) return `Blocked by the ${dl.mood.name} mood`;
  return '';
}

/** The Wildcard and its tone drawn together: that tone is forced. */
export function forcedTone() {
  const dl = d();
  const w = dl.options.wildcard;
  if (w && dl.hand.includes('Wildcard') && dl.hand.includes(w)) return w;
  return null;
}

export const anyUsable = () => d().hand.some((c) => !unusableReason(c));

// ---------------------------------------------------------------
// Exchanges
// ---------------------------------------------------------------
/**
 * Play a card.
 *   card: a tone name, 'Wildcard', or 'Err…hmm'
 *   opts.lie: you're lying in this exchange
 *   opts.chosen: reaction level picked by you (when the rules let you choose)
 * Returns the exchange record, or { needsChoice: [reactions] } when
 * the rules say you pick the reaction yourself.
 */
export function playCard(card, opts = {}) {
  const dl = d();
  if (dl.ended) return null;
  let tone = card === 'Err…hmm' ? 'Err…hmm' : toneOf(card);
  const notes = [];

  // Wildcard + its tone in the same hand: must use it, pick the reaction.
  const forced = forcedTone();
  let choose = false;
  if (forced && card !== 'Err…hmm') {
    tone = forced;
    if (unusableReason(forced)) { tone = 'Err…hmm'; notes.push('Forced tone is unusable: Err…hmm'); }
    else { choose = true; notes.push('Wildcard + its tone: you pick the reaction'); }
  }
  if (tone !== 'Err…hmm' && unusableReason(card) && !forced) return null;

  const mod = tone === 'Err…hmm' ? (d().negotiator || 0) + (effectActive() ? (effect().mods?.all || 0) : 0) : modifierFor(tone);
  const eff = dl.attitude + mod;
  let group = attitudeGroup(clampAtt(eff));
  // A modifier can make a tone unusable once the mood is revealed.
  if (tone !== 'Err…hmm' && !REACTION_TABLE[tone][group]) { notes.push(`${tone} isn't possible at that attitude: Err…hmm`); tone = 'Err…hmm'; }
  const row = REACTION_TABLE[tone][group];

  let roll = null, level;
  // Shifting past the ends of the scale. Let's Talk: pick the reaction /
  // automatic Negative. Keeping Contact porting: roll extra d10s at the
  // end column and keep the highest (right) or lowest (left).
  let extraDice = 0;
  if (eff > 2 || eff < -2) {
    if (dl.options.porting) {
      extraDice = Math.min(2, Math.abs(eff) - 2) * Math.sign(eff);
      notes.push(`Past the scale: roll ${1 + Math.abs(extraDice)}d10, keep the ${extraDice > 0 ? 'highest' : 'lowest'}`);
    } else if (eff > 2) { choose = true; notes.push('Attitude pushed above Very friendly: you pick the reaction'); }
    else if (!choose) { level = 'N'; notes.push('Attitude pushed below Very unfriendly: automatic Negative'); }
  }

  if (choose) {
    if (!opts.chosen) return { needsChoice: row.map((r, i) => ({ level: LEVELS[i], reaction: r })) };
    level = opts.chosen;
  } else if (!level) {
    const dice = Array.from({ length: 1 + Math.abs(extraDice) }, () => rollDie(10));
    roll = extraDice > 0 ? Math.max(...dice) : extraDice < 0 ? Math.min(...dice) : dice[0];
    if (dice.length > 1) notes.push(`d10s: ${dice.join(', ')}`);
    const col = ATTITUDE_COLS.indexOf(attitudeName(clampAtt(eff)));
    level = REACTION_ROLL.find(([lo, hi]) => roll >= lo && roll <= hi)[2 + col];
    // Mood shifts.
    if (effectActive()) {
      const e = effect();
      if (e.shift && e.shift[level]) { notes.push(`${dl.mood.name}: ${level} → ${e.shift[level]}`); level = e.shift[level]; }
      if (e.special === 'pragmatic' && (level === 'P' || level === 'N') && !dl.pragmaticUsed[level]) {
        dl.pragmaticUsed[level] = true;
        const to = level === 'P' ? 'SP' : 'SN';
        notes.push(`Pragmatic: ${level} → ${to}`); level = to;
      }
    }
  }
  let reaction = row[LEVELS.indexOf(level)];

  // Lying: caught on a somewhat negative or negative result.
  let caught = false;
  if (opts.lie) {
    caught = level === 'SN' || level === 'N';
    if (caught && reaction !== 'Hostile' && reaction !== 'Furious') reaction = 'Rude';
    notes.push(caught ? 'Caught lying!' : level === 'SP' ? 'Barely believed' : 'Believed');
  }

  const record = { n: dl.exchange, card, tone, mod, roll, level, reaction, lie: !!opts.lie, caught, notes };
  dl.history.push(record);

  // Bookkeeping for the next exchange.
  dl.seen.push(reaction);
  dl.negotiator = 0;
  if (effect()?.special === 'negotiator') dl.negotiator = level === 'N' ? -1 : level === 'P' ? 1 : 0;
  if (tone === 'Flirting' || tone === 'Romantic') {
    updateNpc(dl.npcId, tone === 'Flirting' ? { flirtCooldown: true } : { romanceCooldown: true });
  }
  // Cards leave the hand; reshuffle-mood cards go back once.
  const res = effectActive() ? effect().reshuffle || [] : [];
  if (dl.options.hardcore) {
    dl.hand.splice(dl.hand.indexOf(card === 'Err…hmm' ? dl.hand[0] : card), 1);
  } else {
    for (const c of dl.hand) {
      const t = toneOf(c);
      if (res.includes(t) && !dl.reshuffled.includes(c)) { dl.reshuffled.push(c); dl.deck.push(c); shuffle(dl.deck); }
    }
    dl.hand = [];
  }

  // Does the dialogue end?
  const max = effect()?.special === 'tired' ? 2 : 3;
  if (reaction === 'Furious') { dl.ended = true; dl.endReason = 'The NPC is Furious. The dialogue is over.'; }
  else if (dl.exchange >= max) { dl.ended = true; dl.endReason = max === 2 ? 'The NPC is Tired: two exchanges at most.' : 'Three exchanges: time to wrap up.'; }
  else if (dl.options.hardcore && !dl.hand.length) { dl.ended = true; dl.endReason = 'No tone cards left (Hardcore).'; }
  else { dl.exchange += 1; drawHand(); }

  save('dialogue'); emit();
  return record;
}

/** Hardcore mode: no usable card in hand → discard one, draw one. */
export function hardcoreRedraw(card) {
  const dl = d();
  const i = dl.hand.indexOf(card);
  if (i < 0 || !dl.deck.length) return false;
  dl.hand.splice(i, 1);
  dl.hand.push(dl.deck.shift());
  save('dialogue'); emit();
  return true;
}

export function endDialogue(reason = 'You ended the conversation.') {
  const dl = d();
  if (!dl) return;
  dl.ended = true;
  dl.endReason = reason;
  save('dialogue'); emit();
}

export function closeDialogue() {
  state.dialogue = null;
  save('dialogue'); emit();
}

// ---------------------------------------------------------------
// Persuading: a final check against the Attitude, adjusted for how
// the dialogue went (-1, 0, +1). Positive = Yes … Negative = No.
// ---------------------------------------------------------------
export function persuade(adjust = 0) {
  const att = clampAtt(d().attitude + adjust);
  const roll = rollDie(10);
  const level = REACTION_ROLL.find(([lo, hi]) => roll >= lo && roll <= hi)[2 + ATTITUDE_COLS.indexOf(attitudeName(att))];
  const answer = { P: 'Yes', SP: 'Yes, but…', SN: 'No, but…', N: 'No' }[level];
  return { roll, attitude: att, level, answer };
}

/** Short summary of a finished dialogue, for the log. */
export function summary() {
  const dl = d();
  const npc = getNpc(dl.npcId);
  const lines = [
    `Attitude: ${attitudeName(dl.attitude)} · Mood: ${dl.mood.name} · Topic: ${dl.topic.text}`,
    ...dl.history.map((h) => `${h.n}. ${h.tone}${h.lie ? ' (lie)' : ''} → **${h.reaction}**${h.roll != null ? ` (d10 ${h.roll})` : ''}`),
    dl.endReason,
  ];
  return { title: `Talked with ${npc ? npc.name : 'NPC'}`, body: lines.join('\n') };
}
