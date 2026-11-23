// =============================================================
// mythic.js — Mythic GM Emulator 2nd Edition mechanics
// -------------------------------------------------------------
// This file holds PROCEDURES only. None of the book's tables are in
// here. You paste them from your copy in Mythic → Setup / Tables:
//   • Fate Check modifiers and/or fate charts (one set per chaos variant)
//   • Event Focus, Actions ×2, Descriptions ×2, Elements tables,
//     Scene Adjustment, Thread Discovery Check → ordinary tables
//
// Implemented:
//   Fate Check (2d10 + modifiers; default) or Fate Chart (d100)
//   Chaos variants: standard / mid / low / none
//   Random events on doubles ≤ Chaos (both methods)
//   Scene test: d10 ≤ Chaos → odd = Altered (+ Scene Adjustment),
//               even = Interrupt (+ random event)
//   Event Focus → picks from Threads/Characters lists (2e 5×5 lists)
//   Meaning: word pairs from Actions, Descriptions or any Elements table
//   NPC behaviour + Discovery check interpretations
//   Thread Progress Track (10/15/20, phases of 5, Flashpoints)
//   Keyed Scenes (your own triggers with counters)
// =============================================================

import { state, save, emit, activeCampaign } from './state.js';
import { rollDie, uid } from './rng.js';
import { getTable, rollTable, dieSize, inFolder, visibleTables } from './tables.js';

export const CHAOS_MIN = 1, CHAOS_MAX = 9;
export const VARIANTS = { standard: 'Standard', mid: 'Mid-chaos', low: 'Low-chaos', none: 'No-chaos' };
const m = () => state.mythic;

// ---------------------------------------------------------------
// Old saves (v0.1) stored one chart + one meaning list. Move them
// into the 2e shape the first time this version runs.
// ---------------------------------------------------------------
export function migrate() {
  const s = m();
  let changed = false;
  if (s.chart !== undefined) {
    if (s.chart && !s.charts.standard) s.charts.standard = s.chart;
    delete s.chart; changed = true;
  }
  if (Array.isArray(s.meaningTables)) {
    if (s.meaningTables.length && !s.actionTables.length) s.actionTables = s.meaningTables.slice(0, 2);
    delete s.meaningTables; changed = true;
  }
  if (s.track !== undefined) {
    if (s.track && !s.tracks.length) {
      const id = uid();
      s.tracks.push({ id, ...s.track });
      s.activeTrack = id;
    }
    delete s.track; changed = true;
  }
  if (changed) save('mythic');
}

// ---------------------------------------------------------------
// Chaos
// ---------------------------------------------------------------
export function setChaos(n) {
  m().chaos = Math.max(CHAOS_MIN, Math.min(CHAOS_MAX, n));
  save('mythic');
  emit();
}

/** Doubles (11, 22 … 99) whose digit is ≤ Chaos trigger an event. */
function isDoublesEvent(a, b, chaos) {
  return a === b && a <= chaos; // a 10+10 roll is "10", above any chaos
}

// ---------------------------------------------------------------
// Fate Check modifiers (pasted). Shape:
//   { odds: { 'Likely': 1, … }, chaos: { 1: -5, … 9: 5 } }
// Paste format, one per line:
//   Likely: +1          ← odds label then modifier
//   CF 6: +1  or  6: +1 ← chaos value then modifier
// ---------------------------------------------------------------
export function parseCheckMods(text) {
  const mods = { odds: {}, chaos: {} };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const mm = line.match(/^(.*?)[:\s]\s*([+\-−–]?\s*\d+|none|0)\s*$/i);
    if (!mm) throw new Error(`Couldn't read: "${line}"`);
    const label = mm[1].replace(/[:\s]+$/, '').trim();
    const val = /none/i.test(mm[2]) ? 0 : parseInt(mm[2].replace(/[−–]/, '-').replace(/\s/g, ''), 10);
    const cf = label.match(/^(?:cf|chaos(?: factor)?)?\s*(\d)$/i);
    if (cf) mods.chaos[+cf[1]] = val;
    else mods.odds[label] = val;
  }
  if (!Object.keys(mods.odds).length) throw new Error('Add at least one odds line, e.g. "Likely: +1".');
  return mods;
}

export function checkModsToText(mods) {
  if (!mods) return '';
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  return [
    ...Object.entries(mods.odds).map(([k, v]) => `${k}: ${sign(v)}`),
    ...Object.entries(mods.chaos).map(([k, v]) => `CF ${k}: ${sign(v)}`),
  ].join('\n');
}

// ---------------------------------------------------------------
// Fate charts (pasted), one per variant. Shape:
//   { odds: [labels], cells: [[{exYes, chance, exNo} × 9 chaos]] }
// Paste: label, then 9 chances or 27 numbers (exYes chance exNo).
// ---------------------------------------------------------------
export function exceptionals(chance) {
  return { exYes: Math.max(0, Math.floor(chance / 5)), exNo: 100 - Math.floor((100 - chance) / 5) + 1 };
}

export function parseChart(text) {
  const odds = [], cells = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const mm = line.match(/^(.*?)[:\s]\s*((?:[-−–]?\d+|[-−–]|x)(?:[\s,/|]+(?:[-−–]?\d+|[-−–]|x))*)\s*$/i);
    if (!mm) throw new Error(`Couldn't read this line: "${line}"`);
    const label = mm[1].replace(/[:\s]+$/, '').trim();
    const nums = mm[2].split(/[\s,/|]+/).map((v) =>
      (/^[-−–x]$/i.test(v) ? null : parseInt(v.replace(/[−–]/, '-'), 10)));
    let row;
    if (nums.length === 27) {
      row = [];
      for (let i = 0; i < 27; i += 3) row.push({ exYes: nums[i] ?? 0, chance: nums[i + 1] ?? 0, exNo: nums[i + 2] ?? 101 });
    } else if (nums.length === 9) {
      row = nums.map((c) => ({ chance: c ?? 0, ...exceptionals(c ?? 0) }));
    } else {
      throw new Error(`"${label}" has ${nums.length} numbers; expected 9 (one chance per Chaos 1–9) or 27 (exYes/chance/exNo × 9).`);
    }
    odds.push(label || `Row ${odds.length + 1}`);
    cells.push(row);
  }
  if (!odds.length) throw new Error('Paste at least one row.');
  return { odds, cells };
}

export function chartToText(chart) {
  if (!chart) return '';
  return chart.odds.map((label, r) =>
    `${label}: ` + chart.cells[r].map((c) => `${c.exYes}/${c.chance}/${c.exNo}`).join('  ')).join('\n');
}

// ---------------------------------------------------------------
// Fate questions
// ---------------------------------------------------------------
/**
 * The rules in force: the global setup, unless the current campaign
 * overrides the method or chaos variant (Campaign sheet).
 */
export function rules() {
  const o = activeCampaign()?.overrides || {};
  return { method: o.method || m().method, variant: o.variant || m().variant,
    overridden: !!(o.method || o.variant) };
}

/** The odds labels to offer for the current method + variant. */
export function oddsLabels() {
  const s = m();
  const { method, variant } = rules();
  if (method === 'chart') return s.charts[variant]?.odds || [];
  const mods = s.checkMods[variant];
  return mods ? Object.keys(mods.odds) : [];
}

export function isReady() {
  const s = m();
  const { method, variant } = rules();
  return method === 'chart' ? !!s.charts[variant] : !!s.checkMods[variant];
}

/**
 * Ask a fate question with the chosen method.
 *   oddsLabel: one of oddsLabels(), or null with customChance
 * Returns { method, answer, event, detail… }
 */
export function askFate(oddsLabel, customChance = 50) {
  const s = m();
  const chaos = s.chaos;
  // Custom % always uses the d100 roll (handy before setup is done).
  const { method, variant } = rules();
  if (method === 'chart' || oddsLabel == null || !isReady()) return askChart(oddsLabel, customChance, chaos);

  const mods = s.checkMods[variant];
  const oddsMod = mods.odds[oddsLabel] ?? 0;
  const chaosMod = mods.chaos[chaos] ?? 0;
  const a = rollDie(10), b = rollDie(10);
  const total = a + b + oddsMod + chaosMod;
  let answer;
  if (total >= 18 && total <= 20) answer = 'Exceptional Yes';
  else if (total >= 11) answer = 'Yes';
  else if (total >= 2 && total <= 4) answer = 'Exceptional No';
  else answer = 'No';
  const event = isDoublesEvent(a, b, chaos) ? randomEvent() : null;
  return { method: 'check', oddsLabel, chaos, dice: [a, b], oddsMod, chaosMod, total, answer, event };
}

function askChart(oddsLabel, customChance, chaos) {
  const s = m();
  const chart = s.charts[rules().variant];
  let cell;
  if (oddsLabel != null && chart) {
    cell = chart.cells[chart.odds.indexOf(oddsLabel)][chaos - 1];
  } else {
    cell = { chance: customChance, ...exceptionals(customChance) };
    oddsLabel = `${customChance}%`;
  }
  const r = rollDie(100);
  let answer;
  if (cell.exYes && r <= cell.exYes) answer = 'Exceptional Yes';
  else if (r <= cell.chance) answer = 'Yes';
  else if (r >= cell.exNo) answer = 'Exceptional No';
  else answer = 'No';
  const tens = Math.floor(r / 10), ones = r % 10;
  const event = r >= 11 && r <= 99 && isDoublesEvent(tens, ones, chaos) ? randomEvent() : null;
  return { method: 'chart', oddsLabel, chaos, roll: r, ...cell, answer, event };
}

/** One-line description of how the answer was rolled. */
export function fateDetail(r) {
  if (r.method === 'check') {
    const mod = r.oddsMod + r.chaosMod;
    return `2d10 [${r.dice.join('+')}] ${mod >= 0 ? '+' : '−'} ${Math.abs(mod)} = ${r.total} · ${r.oddsLabel} (${fmt(r.oddsMod)}), Chaos ${r.chaos} (${fmt(r.chaosMod)})`;
  }
  return `d100 ${r.roll} vs ${r.chance} · ${r.oddsLabel}, Chaos ${r.chaos}`;
}
const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

// Interpretation helpers for special kinds of questions. These are
// short summaries in our own words of how the rules treat each answer.
export const INTERPRET = {
  npc: {
    'Yes': 'They do it, or keep doing what they were doing.',
    'No': 'They do the next most likely thing instead. No idea what? Roll meaning.',
    'Exceptional Yes': 'They do it with extra intensity.',
    'Exceptional No': 'They do the opposite, or the next most likely thing with extra intensity.',
    event: 'Something extra happens as well: treat the event as an additional action (focus: Current Context).',
  },
  discovery: {
    'Yes': 'Something is discovered: roll on the Thread Discovery Check table.',
    'No': 'Nothing useful is found.',
    'Exceptional Yes': 'A big find: roll twice on the Thread Discovery Check table and combine.',
    'Exceptional No': 'Dead end: no more Discovery Checks this scene.',
  },
};

// ---------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------
/** Test the expected scene. Also advances the scene counter. */
export function testScene() {
  const s = m();
  s.scene = (s.scene || 0) + 1;
  s.noDiscovery = false; // a dead end only lasts one scene
  const keyedHits = advanceKeyed();
  const chaos = s.chaos;
  const r = rollDie(10);
  let result = 'Expected', adjustments = null, event = null;
  if (r <= chaos) {
    if (r % 2 === 1) { result = 'Altered'; adjustments = sceneAdjustments(); }
    else { result = 'Interrupt'; event = randomEvent(); }
  }
  // A Flashpoint queued from last scene's bookkeeping happens now
  // (on any track, not just the one currently shown).
  let flashpoint = null;
  for (const t of s.tracks) {
    if (t.pendingFlashpoint) {
      flashpoint = flashpointEvent(t);
      t.pendingFlashpoint = false;
      break; // one per scene; any others wait for the next scene
    }
  }
  save('mythic');
  return { scene: s.scene, roll: r, chaos, result, adjustments, event, keyedHits, flashpoint };
}

/**
 * Roll the Scene Adjustment table. If the result says to make two
 * adjustments, roll twice more (re-rolling any further "make 2").
 */
export function sceneAdjustments() {
  const t = getTable(m().sceneAdjustTable);
  if (!t) return null;
  const isDouble = (txt) => /\b(2|two)\b.*adjust/i.test(txt);
  const first = rollTable(t);
  if (!isDouble(first.text)) return [{ roll: first.roll, text: first.text }];
  const out = [{ roll: first.roll, text: first.text }];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const r = rollTable(t);
    if (!isDouble(r.text)) out.push({ roll: r.roll, text: r.text });
  }
  return out;
}

export function endScene(delta) {
  const before = m().chaos;
  setChaos(before + delta);
  return { before, after: m().chaos };
}

// ---------------------------------------------------------------
// Lists (2e): 25 lines in 5 sections of 5. Duplicates add weight.
// Roll which section (only active sections), then d10 for the line:
//   1–2 → line 1, 3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5.
// Landing on an empty line means "Choose": pick what fits best.
// ---------------------------------------------------------------
export function ensureMythicLists() {
  const lists = state.trackers.lists;
  let changed = false;
  for (const [id, name] of [['mythic-threads', 'Threads'], ['mythic-characters', 'Characters']]) {
    if (!lists.find((l) => l.id === id)) { lists.push({ id, name, items: [] }); changed = true; }
  }
  if (changed) save('trackers');
}

export const getList = (id) => state.trackers.lists.find((l) => l.id === id);

export function rollList(id) {
  const list = getList(id);
  if (!list || !list.items.length) return { empty: true };
  const used = Math.min(list.items.length, 25);
  const sections = Math.ceil(used / 5);
  let section = 1, sectionRoll = null, sectionDie = null;
  if (sections > 1) {
    sectionDie = sections * 2;              // 2→d4, 3→d6, 4→d8, 5→d10
    sectionRoll = rollDie(sectionDie);
    section = Math.ceil(sectionRoll / 2);
  }
  const lineRoll = rollDie(10);
  const line = Math.ceil(lineRoll / 2);
  const index = (section - 1) * 5 + (line - 1);
  const item = list.items[index] || null;
  return { list: list.name, item, choose: !item, line: index + 1, sectionDie, sectionRoll, lineRoll };
}

export function listRollText(r) {
  if (r.empty) return `${r.list || 'List'} is empty`;
  const dice = (r.sectionDie ? `d${r.sectionDie} ${r.sectionRoll}, ` : '') + `d10 ${r.lineRoll} → line ${r.line}`;
  return r.choose ? `Choose (empty line: pick what fits) · ${dice}` : `${r.item.text} · ${dice}`;
}

export function addListItem(listId, text) {
  const list = getList(listId);
  if (!list || !text.trim()) return;
  list.items.push({ id: uid(), text: text.trim() });
  save('trackers'); emit();
}

export function removeListItem(listId, itemId) {
  const list = getList(listId);
  if (!list) return;
  list.items = list.items.filter((i) => i.id !== itemId);
  save('trackers'); emit();
}

export function moveListItem(listId, itemId, dir) {
  const list = getList(listId);
  const i = list.items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.items.length) return;
  [list.items[i], list.items[j]] = [list.items[j], list.items[i]];
  save('trackers'); emit();
}

// ---------------------------------------------------------------
// Meaning
// ---------------------------------------------------------------
/** Every meaning option available: Actions, Descriptions, Elements. */
export function meaningOptions() {
  const s = m();
  const opts = [];
  const pair = (ids) => ids.map(getTable).filter(Boolean);
  if (pair(s.actionTables).length) opts.push({ id: 'actions', name: 'Actions', tables: pair(s.actionTables) });
  if (pair(s.descriptionTables).length) opts.push({ id: 'descriptions', name: 'Descriptions', tables: pair(s.descriptionTables) });
  visibleTables()
    .filter((t) => s.elementsFolder && inFolder(t.folder, s.elementsFolder))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((t) => opts.push({ id: t.id, name: t.name, tables: [t] }));
  return opts;
}

/**
 * Roll a word pair. Two-table sets (Actions/Descriptions) roll each
 * table once; a single Elements table is rolled twice.
 */
export function rollMeaning(optionId = m().defaultMeaning) {
  const opts = meaningOptions();
  const opt = opts.find((o) => o.id === optionId) || opts[0];
  if (!opt) return null;
  const tables = opt.tables.length >= 2 ? opt.tables.slice(0, 2) : [opt.tables[0], opt.tables[0]];
  const words = tables.map((t) => { const r = rollTable(t); return { roll: r.roll, text: r.text }; });
  return { option: opt.name, optionId: opt.id, words };
}

export const meaningText = (mn) => (mn ? `${mn.option}: ${mn.words.map((w) => w.text).join(' + ')}` : '');

// ---------------------------------------------------------------
// Random events
// ---------------------------------------------------------------
/**
 * Focus (from your table) + meaning. If the focus names an existing
 * NPC or thread, pick one from the list; if that list is empty the
 * focus becomes Current Context, as the rules say.
 */
export function randomEvent(forcedFocus = null) {
  let focus = null;
  if (forcedFocus) {
    focus = { roll: null, text: forcedFocus };
  } else {
    const t = getTable(m().focusTable);
    if (t) {
      const r = rollTable(t);
      focus = { roll: r.roll, text: r.text };
      const low = r.text.toLowerCase();
      const isNew = /\bnew\b|introduce/.test(low);
      let listId = null;
      if (!isNew && low.includes('thread')) listId = 'mythic-threads';
      else if (!isNew && /\bnpc\b|character/.test(low)) listId = 'mythic-characters';
      if (listId) {
        const pick = rollList(listId);
        if (pick.empty) focus.note = 'List is empty, so the focus becomes Current Context.';
        else focus.pick = pick;
      }
    }
  }
  return { focus, meaning: rollMeaning(), configured: !!(focus || meaningOptions().length) };
}

export function eventText(ev) {
  if (!ev) return '';
  if (!ev.configured) return 'Random event! (Set up the Event Focus and meaning tables in Mythic → Setup.)';
  const lines = [];
  if (ev.focus) {
    lines.push(`Focus${ev.focus.roll != null ? ` (${ev.focus.roll})` : ''}: ${ev.focus.text}`);
    if (ev.focus.pick) lines.push(`↳ ${listRollText(ev.focus.pick)}`);
    if (ev.focus.note) lines.push(`↳ ${ev.focus.note}`);
  }
  if (ev.meaning) lines.push(meaningText(ev.meaning));
  return lines.join('\n');
}

// ---------------------------------------------------------------
// Thread Progress Tracks — one per thread, kept while you work on
// other things. One is "active" (the one shown and used by
// Discovery Checks); switching keeps everyone's progress.
//   { id, thread, length: 10|15|20, points, flash: [bool per phase],
//     pendingFlashpoint, done }
// Progress and Flashpoints are worth 2 points. Each phase of 5
// points should contain a Flashpoint; if a phase ends without one,
// a Flashpoint event is triggered.
// ---------------------------------------------------------------
export const activeTrack = () => m().tracks.find((t) => t.id === m().activeTrack) || null;
export const trackFor = (thread) => m().tracks.find((t) => t.thread.toLowerCase() === thread.trim().toLowerCase());

export function startTrack(thread, length) {
  const existing = trackFor(thread);
  if (existing) { m().activeTrack = existing.id; save('mythic'); emit(); return existing; }
  const t = { id: uid(), thread: thread.trim(), length, points: 0, flash: new Array(length / 5).fill(false), pendingFlashpoint: false, done: false };
  m().tracks.push(t);
  m().activeTrack = t.id;
  save('mythic'); emit();
  return t;
}

export function switchTrack(id) {
  const t = m().tracks.find((x) => x.id === id);
  if (t) t.paused = false; // opening a minimized track brings it back
  m().activeTrack = id; save('mythic'); emit();
}

/** Minimize a track: kept with its progress, just tucked away. */
export function pauseTrack(id) {
  const t = m().tracks.find((x) => x.id === id);
  if (!t) return;
  t.paused = true;
  if (m().activeTrack === id) m().activeTrack = m().tracks.find((x) => !x.paused && !x.done)?.id || null;
  save('mythic'); emit();
}

/** Tracks grouped for display. */
export function trackGroups() {
  const all = m().tracks;
  return {
    open: all.filter((t) => !t.paused && !t.done),
    paused: all.filter((t) => t.paused && !t.done),
    done: all.filter((t) => t.done),
  };
}

export function removeTrack(id) {
  m().tracks = m().tracks.filter((t) => t.id !== id);
  if (m().activeTrack === id) m().activeTrack = m().tracks[0]?.id || null;
  save('mythic'); emit();
}

/**
 * Add points to the active track. kind: 'progress' | 'flashpoint' | 'adjust'
 * `now` = true means "during play" (a forced Flashpoint happens
 * immediately); false = bookkeeping (it happens next scene).
 * Returns { added, forced: [phase…], flashpoint, conclusion }
 */
export function addProgress(points, kind = 'progress', now = true) {
  const t = activeTrack();
  if (!t || t.done) return null;
  const before = t.points;
  t.points = Math.max(0, Math.min(t.length, t.points + points));
  const phaseOf = (p) => Math.min(Math.floor(Math.max(p - 1, 0) / 5), t.flash.length - 1);
  if (kind === 'flashpoint') t.flash[phaseOf(t.points)] = true;

  // Which phase boundaries (5, 10, 15) did we cross without a Flashpoint?
  const forced = [];
  for (let edge = 5; edge < t.length; edge += 5) {
    const phase = edge / 5 - 1;
    if (before < edge && t.points >= edge && !t.flash[phase]) { forced.push(phase + 1); t.flash[phase] = true; }
  }
  let flashpoint = null;
  if (forced.length) {
    if (now) flashpoint = flashpointEvent(t); else t.pendingFlashpoint = true;
  }
  const conclusion = t.points >= t.length;
  if (conclusion) t.done = true;
  save('mythic'); emit();
  return { added: t.points - before, forced, flashpoint, conclusion };
}

function flashpointEvent(t) {
  const thread = t?.thread || 'the focus thread';
  return randomEvent(`Current Context: a dramatic, important event involving "${thread}" (without resolving it)`);
}

/** Discovery: roll the discovery table with 1d10 + current points. */
export function discoveryRoll() {
  const t = getTable(m().discoveryTable);
  const track = activeTrack();
  if (!t || !track) return null;
  const d = rollDie(10);
  const total = Math.min(d + track.points, dieSize(t));
  const r = rollTable(t, 0, [], total);
  return { d10: d, points: track.points, total, text: r.text, meaning: rollMeaning() };
}

/** Points named in a discovery result like "Progress +2". */
export function discoveryPoints(text) {
  const mm = text.match(/\+\s*(\d)/);
  return mm ? +mm[1] : 0;
}

// ---------------------------------------------------------------
// Keyed Scenes: your own rules. Each has a counter and a target;
// when the counter reaches the target the keyed event is due.
//   { id, name, trigger, event, count, target, auto }
// auto = count up automatically every time you test a new scene.
// ---------------------------------------------------------------
export function addKeyed(k) {
  m().keyed.push({ id: uid(), count: 0, auto: true, ...k });
  save('mythic'); emit();
}

export function bumpKeyed(id, d) {
  const k = m().keyed.find((x) => x.id === id);
  if (!k) return;
  k.count = Math.max(0, k.count + d);
  save('mythic'); emit();
}

export function resetKeyed(id) { bumpKeyed(id, -Infinity); }

export function removeKeyed(id) {
  m().keyed = m().keyed.filter((x) => x.id !== id);
  save('mythic'); emit();
}

/** Count up auto keyed scenes; return the ones now due. */
function advanceKeyed() {
  const due = [];
  for (const k of m().keyed) {
    if (k.auto) k.count += 1;
    if (k.target && k.count >= k.target) due.push(k);
  }
  return due;
}

export const keyedDue = () => m().keyed.filter((k) => k.target && k.count >= k.target);
