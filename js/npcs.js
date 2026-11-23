// =============================================================
// npcs.js — the NPC hub: one card per NPC, per campaign
// -------------------------------------------------------------
// Every feature that needs NPCs reads and updates these cards:
//   • Mythic's Characters list links to cards (item.npcId)
//   • Let's Talk uses a card's Attitude, Mood, romance flags
//   • UNE fills in a card's profile and conversation results
//   • Keeping Contact (next stage) will add AR, conditions, bonds…
//
// Card shape:
//   { id, name, role, attitude: -2..+2, relationship: '' (UNE override),
//     mood: '' (personality mood), romance: false, flirtCooldown: false,
//     une: { modifier, noun, power, motivations: [] },
//     notes, archived, created }
// =============================================================

import { state, save, emit } from './state.js';
import { uid } from './rng.js';
import { ensureKc } from './keepingcontact.js';

// The shared 5-step Attitude scale (Let's Talk & Keeping Contact use
// the same five steps; Keeping Contact numbers them -2..+2).
export const ATTITUDES = [
  { v: -2, name: 'Very unfriendly' },
  { v: -1, name: 'Unfriendly' },
  { v: 0, name: 'Neutral' },
  { v: 1, name: 'Friendly' },
  { v: 2, name: 'Very friendly' },
];
export const attitudeName = (v) => ATTITUDES.find((a) => a.v === v)?.name || 'Neutral';

// UNE uses a 7-step relationship. By default it's derived from the
// Attitude; a card can override it (e.g. Peaceful, Hated, Loved).
export const RELATIONSHIPS = ['loved', 'friendly', 'peaceful', 'neutral', 'distrustful', 'hostile', 'hated'];
export function relationshipOf(npc) {
  if (npc.relationship) return npc.relationship;
  return { 2: 'loved', 1: 'friendly', 0: 'neutral', '-1': 'distrustful', '-2': 'hostile' }[npc.attitude] || 'neutral';
}

export function newNpc(name = 'New NPC') {
  return {
    id: uid(), name, role: '', attitude: 0, relationship: '', mood: '',
    romance: false, flirtCooldown: false,
    une: { modifier: '', noun: '', power: '', motivations: [] },
    notes: '', archived: false, created: Date.now(),
  };
}

export const getNpc = (id) => state.npcs.find((n) => n.id === id);
export const findNpcByName = (name) =>
  state.npcs.find((n) => n.name.trim().toLowerCase() === String(name).trim().toLowerCase());

export function addNpc(npc) {
  state.npcs.push(npc);
  save('npcs'); emit();
  return npc;
}

/** Change fields on a card. Renames flow through to linked list items. */
export function updateNpc(id, changes) {
  const npc = getNpc(id);
  if (!npc) return;
  Object.assign(npc, changes);
  npc.updatedAt = Date.now(); // the Obsidian note is now out of date
  if ('name' in changes) {
    for (const list of state.trackers.lists) {
      for (const it of list.items) if (it.npcId === id) it.text = npc.name;
    }
    save('trackers');
  }
  save('npcs'); emit();
}

export function deleteNpc(id) {
  state.npcs = state.npcs.filter((n) => n.id !== id);
  // Unlink (don't delete) any list entries that pointed at it.
  for (const list of state.trackers.lists) for (const it of list.items) if (it.npcId === id) delete it.npcId;
  if (state.dialogue?.npcId === id) state.dialogue = null;
  save('npcs', 'trackers', 'dialogue'); emit();
}

// ---------------------------------------------------------------
// Mythic Characters list link
// ---------------------------------------------------------------
const CHARACTERS = 'mythic-characters';
const charactersList = () => state.trackers.lists.find((l) => l.id === CHARACTERS);

export function inMythic(id) {
  return !!charactersList()?.items.some((it) => it.npcId === id);
}

export function addToMythic(id) {
  const list = charactersList();
  const npc = getNpc(id);
  if (!list || !npc) return false;
  if (list.items.length >= 25) return false;
  list.items.push({ id: uid(), text: npc.name, npcId: id });
  save('trackers'); emit();
  return true;
}

export function removeFromMythic(id) {
  const list = charactersList();
  if (!list) return;
  list.items = list.items.filter((it) => it.npcId !== id);
  save('trackers'); emit();
}

/**
 * Make sure every Characters list entry has an NPC card. Entries
 * typed in on the Mythic Lists tab (or from older versions) get a
 * card created and linked automatically.
 */
export function syncCharacters() {
  // Every card gets Keeping Contact state; an old "romance" tick becomes a romance stage.
  for (const n of state.npcs) {
    const had = !!n.kc;
    ensureKc(n);
    if (!had && n.romance) n.kc.stage = 'romance';
  }
  const list = charactersList();
  if (!list) return;
  let changed = false;
  for (const it of list.items) {
    if (it.npcId && getNpc(it.npcId)) continue;
    const existing = findNpcByName(it.text);
    const npc = existing || newNpc(it.text);
    if (!existing) state.npcs.push(npc);
    it.npcId = npc.id;
    changed = true;
  }
  if (changed) save('npcs', 'trackers');
}
