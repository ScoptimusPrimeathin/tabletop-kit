// =============================================================
// une.js — UNE (Universal NPC Emulator) procedures
// -------------------------------------------------------------
// UNE is a paid book, so none of its tables are in this code. You
// paste them into ordinary tables (Tables → Bulk paste), then UNE
// setup links each table to a "slot". Slots are matched to your
// tables by name automatically where possible.
//
// Procedures implemented:
//   NPC Creator: modifier + noun, optional power level (by R-level),
//                3 motivations (verb + noun); a motivation noun from
//                the same column (block of 20) as an earlier one is
//                re-rolled, as the rules say.
//   Conversation mood: roll on the table for the NPC's relationship.
//   Discussion: demeanor → bearing word, plus a focus.
// =============================================================

import { state, save, emit } from './state.js';
import { rollDie } from './rng.js';
import { getTable, rollTable, visibleTables } from './tables.js';
import { RELATIONSHIPS } from './npcs.js';

export const R_LEVELS = ['order', 'calm', 'standard', 'disarray', 'chaos'];
export const DEMEANORS = ['scheming', 'insane', 'friendly', 'hostile', 'inquisitive', 'knowing', 'mysterious', 'prejudiced'];

// Every slot: id, label, and the words its table name should contain.
export const SLOTS = [
  { id: 'modifier', label: 'NPC Modifier', words: ['modifier'] },
  { id: 'noun', label: 'NPC Noun', words: ['npc noun'], not: ['motivation'] },
  { id: 'motVerb', label: 'Motivation Verb', words: ['motivation verb'] },
  { id: 'motNoun', label: 'Motivation Noun', words: ['motivation noun'] },
  ...R_LEVELS.map((r) => ({ id: `power:${r}`, label: `Power level: ${cap(r)}`, words: ['power', r], optional: true })),
  ...RELATIONSHIPS.map((r) => ({ id: `mood:${r}`, label: `Conversation mood: ${cap(r)}`, words: ['mood', r] })),
  { id: 'demeanor', label: 'Demeanor', words: ['demeanor'] },
  ...DEMEANORS.map((dm) => ({ id: `bearing:${dm}`, label: `Bearing: ${cap(dm)}`, words: ['bearing', dm] })),
  { id: 'focus', label: 'NPC Focus', words: ['focus'], not: ['event'] },
];
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

/** Table currently linked to a slot (explicit choice, else by name). */
export function slotTable(slotId) {
  const chosen = state.une.slots[slotId];
  if (chosen) return getTable(chosen) || null;
  const slot = SLOTS.find((s) => s.id === slotId);
  const pool = visibleTables().filter((t) => !state.une.folder || t.folder === state.une.folder || t.folder.startsWith(state.une.folder + '/'));
  return pool.find((t) => {
    const name = `${t.name}`.toLowerCase();
    return slot.words.every((w) => name.includes(w)) && !(slot.not || []).some((w) => name.includes(w));
  }) || null;
}

export function setSlot(slotId, tableId) {
  if (tableId) state.une.slots[slotId] = tableId; else delete state.une.slots[slotId];
  save('une'); emit();
}

export function missingSlots(group) {
  return SLOTS.filter((s) => !s.optional && (!group || s.id.startsWith(group) || s.id === group) && !slotTable(s.id));
}

const roll = (slotId) => {
  const t = slotTable(slotId);
  if (!t) return null;
  const r = rollTable(t);
  return { roll: r.roll, text: r.text };
};

// ---------------------------------------------------------------
// NPC Creator
// ---------------------------------------------------------------
export function rollIdentity() {
  const mod = roll('modifier'), noun = roll('noun');
  return { modifier: mod?.text || '', noun: noun?.text || '', rolls: [mod?.roll, noun?.roll] };
}

export function rollPower(rLevel = 'standard') {
  const r = roll(`power:${rLevel}`);
  return r ? { text: r.text, roll: r.roll, rLevel } : null;
}

/**
 * Three motivations. If a noun lands in the same column (1–20,
 * 21–40, …) as an earlier noun, roll the noun again.
 */
export function rollMotivations(count = 3) {
  const out = [];
  const usedCols = new Set();
  for (let i = 0; i < count; i++) {
    const verb = roll('motVerb');
    let noun = roll('motNoun');
    let guard = 0;
    while (noun && usedCols.has(Math.ceil(noun.roll / 20)) && guard++ < 30) noun = roll('motNoun');
    if (noun) usedCols.add(Math.ceil(noun.roll / 20));
    if (verb || noun) out.push(`${verb?.text || '?'} ${noun?.text || '?'}`);
  }
  return out;
}

// ---------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------
export function conversationMood(relationship) {
  const r = roll(`mood:${relationship}`);
  return r ? { relationship, roll: r.roll, text: r.text } : null;
}

/** demeanor: one of DEMEANORS, or '' to roll it. */
export function discussion(demeanor = '') {
  let dm = demeanor, dmRoll = null;
  if (!dm) {
    const r = roll('demeanor');
    if (r) {
      dmRoll = r.roll;
      dm = DEMEANORS.find((x) => r.text.toLowerCase().includes(x)) || r.text.toLowerCase();
    } else {
      dmRoll = rollDie(8);
      dm = DEMEANORS[dmRoll - 1];
    }
  }
  const bearing = roll(`bearing:${dm}`);
  const focus = roll('focus');
  return { demeanor: dm, demeanorRoll: dmRoll, bearing, focus };
}

export function discussionText(x, npcName = 'The NPC') {
  return `${npcName} (${x.demeanor}) speaks of ${x.bearing?.text || '?'} regarding ${x.focus?.text || '?'}.`;
}
