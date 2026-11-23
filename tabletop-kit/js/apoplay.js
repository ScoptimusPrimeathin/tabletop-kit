// =============================================================
// apoplay.js — playing Apothecaria: one campaign's game
// -------------------------------------------------------------
// The library (reagents, ailments) is global and lives in
// apothecaria.js. THIS file is one campaign's game, saved in
// state.apoPlay (per campaign, so two Apothecaria campaigns each
// have their own reputation, silver, calendar, home and stock).
//
// state.apoPlay = {
//   rep: 5, silver: 0, week: 1,          // week 1 = week 1 of Spring, year 1
//   tools: ['mortar', 'cauldron', 'alembic'],
//   unlocked: ['Depths'],                // locales opened by story
//   stock: { reagentId: count },
//   upgrades: [{ id, type, reagents: [ids], locales: [a, b] }],
//   items: { moonstone: 4, flowerCrown: true, … },   // special items
//   familiar: null | { name, form, skill, tool, ways },
//   apprentices: [{ id, name, skill, tool, ways }],
//   hiveUses: 4,                         // Hive: Sweet boosts left this season
//   seasonJoker: false, witchStage: 0, clues: [],
//   patient: null | TRIP + { ailmentId, card, type, who, npcId, ritualUsed, independentUsed },
//   downtime: null | TRIP,               // between ailments: a 6-step timer
//   festival: null | { name, season, games: {} },
//   history: [{ week, ailment, result, silver, rep }],
// }
// TRIP = { timer, turns, locale, travelled, target, points, used, lastDraw, adventurers }
//
// The rules are the book's procedures, written in my own words; the
// book's text (ailments, reagents, events, prompts) is what you paste.
// =============================================================

import { state, save, emit } from './state.js';
import { draw as drawCards, playingCard } from './decks.js';
import { addLog } from './log.js';
import { getReagent, getAilment, TIERS, SEASONS, forageValue } from './apothecaria.js';
import { getTable, rollTable, columnTable } from './tables.js';
import { uid } from './rng.js';

// ---------------------------------------------------------------
// Fixed rule data (names, prices, effects in short)
// ---------------------------------------------------------------
export const TOOLS = [
  { id: 'mortar', name: 'Mortar and Pestle', price: 0, method: 'CRUSH', start: true },
  { id: 'cauldron', name: 'Cauldron', price: 0, method: 'BOIL', start: true },
  { id: 'alembic', name: 'Alembic', price: 0, method: 'DISTIL', start: true },
  { id: 'sickle', name: 'Sickle', price: 50, note: '+2 foraging points instead of 1' },
  { id: 'wand', name: 'Wand', price: 100, note: 'collect reagents that require a wand' },
  { id: 'athame', name: 'Athame', price: 80, note: 'use the Ritual Circle in the village' },
  { id: 'broom', name: 'Broom', price: 100, note: 'opens The Cloud Isles', unlocks: 'isles' },
  { id: 'coracle', name: 'Coracle', price: 70, note: 'opens Blastfire Bog', unlocks: 'bog' },
];

// Upgrades. `hold` = what you choose to keep in it: { n, type?, locale?, max? }
// (reagents kept in an upgrade are always available: no foraging, no stock used).
export const UPGRADES = [
  { id: 'garden', name: 'Garden Plot', price: 100, hold: { n: 1, type: 'PLANT', max: 8 }, note: 'grow 1 PLANT of value 8 or lower', start: 1 },
  { id: 'hive', name: 'Hive', price: 50, note: '+1 Sweet to 4 potions per season' },
  { id: 'fishtank', name: 'Fish Tank', price: 150, hold: { n: 2, max: 8 }, note: 'keep 2 fish of value 8 or lower' },
  { id: 'paddock', name: 'Paddock', price: 300, hold: { n: 2, type: 'ANIMAL', max: 8 }, note: 'keep 2 ANIMAL reagents of value 8 or lower' },
  { id: 'basement', name: 'Basement Hollow', price: 500, hold: { n: 5, locale: 'dungeon' }, note: 'up to 5 Dungeon reagents' },
  { id: 'greenhouse', name: 'Glimmerwood Greenhouse', price: 500, hold: { n: 5, locale: 'forest' }, note: 'up to 5 Forest reagents' },
  { id: 'pond', name: 'Meltwater Pond', price: 500, hold: { n: 5, locale: 'loch' }, note: 'up to 5 Loch reagents' },
  { id: 'minimountain', name: 'Mini Mountain', price: 500, hold: { n: 5, locale: 'mountain' }, note: 'up to 5 Mountain reagents' },
  { id: 'treatment', name: 'Treatment Room', price: 300, note: 'all Timers +3, +10 silver per successful potion' },
  { id: 'spareroom', name: 'Spare Room', price: 500, minRep: 30, note: 'gain an Apprentice (Reputation 30+)' },
  { id: 'spiritseal', name: 'Spirit Seal', price: 300, note: 'send hauntings on to the afterlife' },
  { id: 'travelstone', name: 'Travel Stone', price: 200, link: true, note: 'link 2 locales: moving between them is free' },
  { id: 'ravenloft', name: 'Raven Loft', price: 150, note: 'a second, far-away patient (double silver for theirs)' },
];

// Familiar (and apprentice) skills, by card: A … 10, J, Q/K.
export const SKILLS = [
  { id: 'forager', rank: 1, name: 'Forager', note: 'PLANT values −2 (min 1)' },
  { id: 'scout', rank: 2, name: 'Scout', note: 'all ailment Timers +2' },
  { id: 'helpful', rank: 3, name: 'Helpful', note: '+1 Sweet or −1 Poison on a finished potion' },
  { id: 'cute', rank: 4, name: 'Cute', note: 'when given a reagent, draw twice and take the higher card' },
  { id: 'shrewd', rank: 5, name: 'Shrewd', note: '+50% whenever you gain silver' },
  { id: 'ways', rank: 6, name: 'Ways', note: 'one chosen reagent of value 7 or less is always available' },
  { id: 'independent', rank: 7, name: 'Independent', note: 'once per foraging, send them to another locale (no events)' },
  { id: 'hunter', rank: 8, name: 'Hunter', note: 'ANIMAL values −3 (min 1)' },
  { id: 'prepared', rank: 9, name: 'Prepared', note: 'start each foraging track with 2 points' },
  { id: 'transport', rank: 10, name: 'Transport', note: 'changing locale costs no Timer' },
  { id: 'magiceye', rank: 11, name: 'Magic Eye', note: 'MAGIC values −3 (min 1)' },
  { id: 'useful', rank: 12, name: 'Useful', note: 'works as one Tool of your choice' },
];
export const skillForRank = (rank) => SKILLS.find((s) => s.rank === Math.min(rank, 12));

// Special items (gifts, festival prizes). `uses` = limited charges.
export const ITEMS = [
  { id: 'golem', name: 'Golem Helper', note: 'tend, make or search (one task per season)' },
  { id: 'moonstone', name: 'Moonstone', uses: 4, note: 'purify a potion: remove all Poison (4 uses)' },
  { id: 'mimic', name: 'Mimic', note: 'runs village errands: no Timer to use village services' },
  { id: 'map', name: 'Tourist Map', note: 'find your way in The Strange' },
  { id: 'flowerCrown', name: 'The Flower Crown', note: 'PLANT values −2' },
  { id: 'crownOfBones', name: 'The Crown of Bones', note: 'ANIMAL values −2' },
  { id: 'batasOar', name: "Bata's Oar", note: '2 foraging points a turn in the Loch' },
  { id: 'sunSugar', name: 'Sun Sugar', note: '+3 Sweet to a potion (a year\'s supply)' },
];

// Festivals: the season that just ENDED → its celebration.
export const FESTIVALS = { Spring: 'Flower Festival', Summer: 'Sunrise Celebration', Autumn: "Bogle's Night", Winter: 'Frostfall Festival' };

export const STARTING_LOCALES = ['forest', 'mountain', 'loch', 'dungeon'];
const PAY = { Novice: 20, Intermediate: 30, Advanced: 40, Expert: 50 };
export const PATIENT_TYPES = { H: 'Villager', D: 'Adventurer', C: 'Monster', S: 'Repeat patient' };
export const WITCH_STAGES = ['First Steps', 'About the Witch', 'The Plot Thickens', 'The Finale'];
const NO_TIMER_LIMIT = 13; // turns before an untimed patient feels neglected
const DOWNTIME_STEPS = 6;

// Locale names are matched loosely ("Mountain" / "Mountains", "Isles").
const key = (name) => String(name).toLowerCase().replace(/s$/, '');

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
export function play() {
  if (!state.apoPlay) {
    state.apoPlay = {
      rep: 5, silver: 0, week: 1, tools: TOOLS.filter((t) => t.start).map((t) => t.id), unlocked: [], stock: {},
      seasonJoker: false, witchStage: 0, clues: [], patient: null, history: [],
    };
  }
  const p = state.apoPlay;
  // Fields added in v0.7.4 (older saves get them here).
  p.upgrades ||= UPGRADES.filter((u) => u.start).map((u) => ({ id: uid(), type: u.id, reagents: [], locales: [] }));
  p.items ||= {};
  p.apprentices ||= [];
  p.hiveUses ??= 4;
  if (p.familiar === undefined) p.familiar = null;
  if (p.downtime === undefined) p.downtime = null;
  if (p.festival === undefined) p.festival = null;
  // v0.7.5 (expansions)
  p.sources ||= [];        // ailment sources used for patient draws ([] = all)
  p.counters ||= [];       // quests & counters: [{ id, name, value, max }]
  p.custom ||= [];         // your own gear with simple effects (see CUSTOM_EFFECTS)
  p.localeMode ||= {};     // locale key → chosen custom event variant ("Fixed", "Guised"…)
  p.night ??= false;       // Nightfall: foraging at night uses Night event tables
  p.golem ||= { task: '', make: '', search: [] };
  p.owned ||= [];          // things bought from shops: [{ name, price, week }]
  p.fishing ||= { rod: '', boat: false, bulb: false }; // Cursed Coast fishing gear
  return p;
}
const commit = () => { save('apoPlay'); emit(); };

/** The trip in progress: a patient's foraging, or downtime. */
export const trip = () => play().patient || play().downtime;

/** Skills from your familiar and apprentices (they stack). */
export function skills() {
  const p = play();
  return [p.familiar, ...p.apprentices].filter(Boolean).map((x) => x.skill).filter(Boolean);
}
const skillCount = (id) => skills().filter((s) => s === id).length;
const helpers = () => [play().familiar, ...play().apprentices].filter(Boolean);

/** Do you own (or have a Useful helper for) this tool? */
export function hasTool(id) {
  return play().tools.includes(id) || helpers().some((h) => h.skill === 'useful' && h.tool === id);
}
export const hasUpgrade = (type) => play().upgrades.some((u) => u.type === type);
export const hasItem = (id) => !!play().items[id];

/**
 * Your own gear (expansion tools, upgrades, boons…) with simple effects:
 *   { id, name, note, on, points, type, delta, timer, ease, freeA, freeB }
 *   points: extra foraging points per miss · type+delta: value change for
 *   a reagent type · timer: added to ailment Timers · ease: tags whose
 *   required potency drops by 1 (min 1) · freeA/freeB: free moves between.
 */
export const customOn = () => play().custom.filter((c) => c.on !== false);

/** Reputation → tier name. */
export function tierOf(rep) {
  if (rep >= 33) return 'Expert';
  if (rep >= 22) return 'Advanced';
  if (rep >= 11) return 'Intermediate';
  return 'Novice';
}

/** Week number → { season, week (1–13), year }. */
export function calendar(week = play().week) {
  const i = week - 1;
  return { season: SEASONS[Math.floor(i / 13) % 4], week: (i % 13) + 1, year: Math.floor(i / 52) + 1 };
}

/** Silver you EARN (Shrewd helpers add 50% each). */
function gain(n) {
  const s = skillCount('shrewd');
  const total = Math.floor(n * (1 + 0.5 * s));
  play().silver += total;
  return total;
}

// ---------------------------------------------------------------
// Locales & values
// ---------------------------------------------------------------
export function localeOpen(name) {
  const k = key(name);
  if (k === 'village' || STARTING_LOCALES.includes(k)) return true;
  if (TOOLS.some((t) => t.unlocks && k.startsWith(t.unlocks) && hasTool(t.id))) return true;
  return play().unlocked.map(key).includes(k);
}

/**
 * The event table for a locale right now. Variants (Setup) can replace
 * the default: Night (Nightfall), a season (Dance of Seasons), or a
 * named state you switch on per campaign ("Fixed", "Guised"…).
 * Order: Night → chosen named variant → this season → default.
 */
export const VARIANT_SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export function eventTable(locale) {
  const k = key(locale);
  const vars = state.apo.localeVariants?.[k] || [];
  const pick = (when) => vars.find((v) => v.when === when && v.table && getTable(v.table));
  const p = play();
  const hit = (p.night && pick('Night')) || (p.localeMode[k] && pick(p.localeMode[k])) || pick(calendar().season);
  if (hit) return getTable(hit.table);
  const id = state.apo.localeTables?.[k];
  return id ? getTable(id) : null;
}
/** Named (non-season, non-night) variants a locale has, e.g. ['Fixed']. */
export function namedVariants(locale) {
  return (state.apo.localeVariants?.[key(locale)] || []).map((v) => v.when)
    .filter((w) => w && w !== 'Night' && !VARIANT_SEASONS.includes(w));
}
export function setLocaleMode(locale, mode) { play().localeMode[key(locale)] = mode || undefined; commit(); }
export function setNight(on) { play().night = on; commit(); }

/**
 * Foraging value right now: the book's value, the season's change,
 * then familiars (Forager, Hunter, Magic Eye) and crowns. Minimum 1.
 */
export function valueNow(r, locale) {
  const base = forageValue(r, locale, calendar().season);
  if (base == null) return null;
  let v = base;
  const t = r.type;
  if (t === 'PLANT') v -= 2 * skillCount('forager') + (hasItem('flowerCrown') ? 2 : 0);
  if (t === 'ANIMAL') v -= 3 * skillCount('hunter') + (hasItem('crownOfBones') ? 2 : 0);
  if (t === 'MAGIC') v -= 3 * skillCount('magiceye');
  for (const c of customOn()) if (c.type && c.type === t) v += +c.delta || 0;
  const mods = trip()?.mods;
  if (mods) v += (mods[t] || 0) + (mods.all || 0);
  return Math.max(1, v);
}

/** Lowest value now over the open locales (for shops and rituals). */
export function bestValue(r) {
  const vals = r.locales.filter((l) => localeOpen(l.name)).map((l) => valueNow(r, l.name)).filter((v) => v != null);
  return vals.length ? Math.min(...vals) : null;
}

/** Reagents you can always use without stock: upgrades + Ways. Returns Set of ids. */
export function freeReagents() {
  const set = new Set();
  for (const u of play().upgrades) (u.reagents || []).forEach((id) => id && set.add(id));
  for (const h of helpers()) if (h.skill === 'ways' && h.ways) set.add(h.ways);
  return set;
}
export const available = (id) => freeReagents().has(id) || (play().stock[id] || 0) > 0;

// ---------------------------------------------------------------
// Drawing cards (Jokers are always Witch clues)
// ---------------------------------------------------------------
function drawOne() {
  for (let i = 0; i < 6; i++) {
    const d = drawCards('standard', 1).cards[0];
    if (!d) return null;
    const c = playingCard(d.id);
    if (!c.joker) return c;
    jokerDrawn();
  }
  return null;
}

// ---------------------------------------------------------------
// Patients
// ---------------------------------------------------------------
function newTrip(timer) {
  return { timer, turns: 0, locale: null, travelled: false, target: null, points: 0, used: [], lastDraw: null, adventurers: 0 };
}

/** Ailments that fit a card (ranges like "1 - 4)", the campaign's sources). */
export function ailmentsFor(tier, rank) {
  const on = play().sources;
  return state.apo.ailments.filter((a) => a.tier === tier && rank >= a.rank && rank <= (a.rankMax || a.rank)
    && (!on.length || on.includes(a.source)));
}

function drawNonJoker() {
  for (let i = 0; i < 6; i++) {
    const d = drawCards('standard', 1).cards[0];
    if (!d) return { empty: true };
    const c = playingCard(d.id);
    if (c.joker) jokerDrawn(); else return { card: c };
  }
  return { empty: true };
}

/**
 * Draw a patient: suit = who, value = which ailment (among the
 * campaign's sources; if several fit, one is picked at random).
 * With a Raven Loft, a second card is a far-away patient.
 */
export function drawPatient(tier = tierOf(play().rep)) {
  const { card, empty } = drawNonJoker();
  if (empty) return { ok: false, message: 'The deck is empty. Reshuffle it on the Cards screen.' };
  const fits = ailmentsFor(tier, card.rank);
  if (!fits.length) {
    return { ok: false, message: `Drew ${card.short}, but there's no ${tier} ailment for that card in your sources. Paste the page, check "Ailments from", or pick one by hand.` };
  }
  const ailment = fits[Math.floor(Math.random() * fits.length)];
  startPatient(ailment.id, card.id);
  if (hasUpgrade('ravenloft')) {
    const second = drawNonJoker();
    const far = second.card && ailmentsFor(tier, second.card.rank);
    if (far?.length) {
      const a2 = far[Math.floor(Math.random() * far.length)];
      play().patient.far = { ailmentId: a2.id, card: second.card.id, timer: startTimer(a2), done: false };
      addLog('apo', `🐦 Raven Loft: a far-away patient with ${a2.name} (${second.card.short})`, 'Cure both within their Timers for double silver on theirs.');
      commit();
    }
  }
  return { ok: true };
}

/** Timer at the start: the ailment's, + Scout helpers, + Treatment Room. */
export function startTimer(a) {
  if (a.timer == null) return null;
  return a.timer + 2 * skillCount('scout') + (hasUpgrade('treatment') ? 3 : 0)
    + customOn().reduce((n, c) => n + (+c.timer || 0), 0);
}

export function startPatient(ailmentId, cardId = null) {
  const p = play();
  const a = getAilment(ailmentId);
  const card = cardId ? playingCard(cardId) : null;
  p.downtime = null;
  p.patient = {
    ...newTrip(startTimer(a)), ailmentId, card: cardId, type: card && !card.joker ? PATIENT_TYPES[cardId[0]] : '',
    who: '', npcId: null, ritualUsed: false, independentUsed: false,
  };
  addLog('apo', `🌿 New patient: ${a.name}`, [
    card ? `${card.short} · ${PATIENT_TYPES[cardId[0]] || ''}` : 'Chosen by hand',
    `Needs ${a.tags.map((t) => `[${t.tag} ${t.pot ? '★'.repeat(t.pot) : '?★'}]`).join(' ')}`,
    a.timer ? `Timer ${p.patient.timer}` : 'No time limit',
  ].join(' · '));
  commit();
}

export const patientAilment = () => (play().patient ? getAilment(play().patient.ailmentId) : null);

/** Spend a turn on the current trip. Returns true if time ran out. */
function tick(n = 1) {
  const t = trip();
  if (!t) return false;
  t.turns += n;
  if (t.far && !t.far.done && t.far.timer != null) t.far.timer = Math.max(0, t.far.timer - n);
  if (t.timer == null) return false;
  t.timer = Math.max(0, t.timer - n);
  if (t.timer > 0) return false;
  if (play().patient) addLog('apo', `⏱ Time's up for ${patientAilment().name}`, `Consequence: ${patientAilment().consequence || '—'}`);
  else addLog('apo', '☕ Downtime is over');
  return true;
}

export function adjustTimer(delta) {
  const t = trip();
  if (!t || t.timer == null) return;
  if (delta < 0) tick(-delta); else t.timer += delta;
  commit();
}

// ---------------------------------------------------------------
// Foraging (works for a patient or during downtime)
// ---------------------------------------------------------------
/** Does moving between these two locales cost a turn? */
function moveIsFree(from, to) {
  if (skillCount('transport')) return true;
  const pair = (a, b) => [a, b].map(key).includes(key(from)) && [a, b].map(key).includes(key(to));
  if (customOn().some((c) => c.freeA && c.freeB && pair(c.freeA, c.freeB))) return true;
  return play().upgrades.some((u) => u.type === 'travelstone' && u.locales?.length === 2
    && u.locales.map(key).includes(key(from)) && u.locales.map(key).includes(key(to)));
}

export function travel(locale) {
  const t = trip();
  if (!t || t.locale === locale) return;
  const cost = t.travelled && !moveIsFree(t.locale, locale);
  const from = t.locale;
  t.locale = locale;
  t.points = 2 * skillCount('prepared'); // a new track (Prepared helpers start ahead)
  t.travelled = true;
  t.lastDraw = null;
  if (cost) tick();
  addLog('apo', `🧭 ${from ? 'Moved' : 'Set out'} to ${locale}${cost ? ' (Timer −1)' : ''}`);
  commit();
}

export function setTarget(reagentId) {
  const t = trip();
  if (t) { t.target = reagentId; commit(); }
}

/** '' if you can collect it, otherwise why not. */
export function blockedBy(r) {
  if (!r.requires) return '';
  const needs = r.requires.toLowerCase();
  const ok = TOOLS.some((t) => hasTool(t.id) && needs.includes(t.name.toLowerCase().split(' ')[0]));
  return ok ? '' : `Requires ${r.requires}`;
}

/** Foraging points gained on a miss. */
function pointsPerMiss(locale) {
  let n = hasTool('sickle') ? 2 : 1;
  if (hasItem('batasOar') && key(locale) === 'loch') n = Math.max(n, 2);
  for (const c of customOn()) n += +c.points || 0;
  n += trip()?.mods?.points || 0;
  return Math.max(0, n);
}
export { pointsPerMiss };

/** Add a found reagent to stock (and log it). */
function collect(r, how = '') {
  const p = play();
  p.stock[r.id] = (p.stock[r.id] || 0) + 1;
  addLog('apo', `🧺 ${r.name} added to stock${how ? ` (${how})` : ''}`);
}

/**
 * Draw while foraging:
 *  1. read the locale's event for the card (once per ailment)
 *  2. card ≥ value → found; otherwise +points; enough points → found
 *  3. a turn passes (Timer −1)
 * A Joker is a Witch clue instead (no event, no turn).
 */
export function forageDraw() {
  const p = play(), t = trip();
  const d = drawCards('standard', 1).cards[0];
  if (!d) return { message: 'The deck is empty. Reshuffle it on the Cards screen.' };
  const card = playingCard(d.id);
  if (card.joker) {
    jokerDrawn();
    t.lastDraw = { card: card.short, joker: true };
    commit();
    return t.lastDraw;
  }
  let event = null;
  const usedKey = `${key(t.locale)}:${card.rank}`;
  const table = eventTable(t.locale);
  if (t.used.includes(usedKey)) event = '(This event already happened.)';
  else if (table) { event = rollTable(table, 0, [], card.rank, card.id[0]).text; t.used.push(usedKey); }
  const r = t.target ? getReagent(t.target) : null;
  let found = false, value = null;
  if (r && !blockedBy(r)) {
    value = valueNow(r, t.locale);
    if (value != null && card.rank >= value) found = true;
    else if (value != null) {
      t.points += pointsPerMiss(t.locale);
      if (t.points >= value) found = true;
    }
    if (found) { p.stock[r.id] = (p.stock[r.id] || 0) + 1; t.points = 2 * skillCount('prepared'); }
  }
  const timeUp = tick();
  t.lastDraw = { card: card.short, red: card.red, rank: card.rank, event, found, reagent: r?.name, value, points: t.points, timeUp };
  addLog('apo', `${card.short} in ${t.locale}${found ? ` — found ${r.name}!` : r && value != null ? ` — ${t.points}/${value} points for ${r.name}` : ''}`, event || '');
  commit();
  return t.lastDraw;
}

/** Hired adventurer: cancel the event you just drew. */
export function negateEvent() {
  const t = trip();
  if (!t?.lastDraw || !t.adventurers) return;
  t.adventurers--;
  t.lastDraw.negated = true;
  addLog('apo', '🗡 Your adventurer deals with that event');
  commit();
}

/**
 * Independent helper: once per ailment, send them to ANOTHER locale for
 * one reagent. Draw a card: ≥ its value there and they bring it back.
 */
export function sendIndependent(reagentId, locale) {
  const t = trip(), r = getReagent(reagentId);
  if (!t || t.independentUsed || !r) return null;
  const card = drawOne();
  if (!card) return null;
  const value = valueNow(r, locale);
  const found = value != null && card.rank >= value;
  t.independentUsed = true;
  if (found) collect(r, 'brought by your familiar');
  addLog('apo', `🐾 Sent your familiar to ${locale} for ${r.name}: ${card.short} vs ${value} — ${found ? 'found it!' : 'came back empty-pawed'}`);
  commit();
  return { card: card.short, value, found };
}

// ---------------------------------------------------------------
// The village (High Rannoc)
// ---------------------------------------------------------------
/** Going to the village costs a turn (the Mimic runs errands for free). */
export function visitVillage() {
  const free = hasItem('mimic');
  if (trip() && !free) tick();
  addLog('apo', `🏘 Village${trip() && !free ? ' (Timer −1)' : ''}`);
  commit();
}

/** Copper Fox Tavern: 10 silver for an adventurer who can cancel one event. */
export function hireAdventurer() {
  const p = play(), t = trip();
  if (!t) return 'Only while foraging.';
  if (p.silver < 10) return 'Not enough silver (10).';
  p.silver -= 10;
  t.adventurers = (t.adventurers || 0) + 1;
  addLog('apo', '🍺 Hired an adventurer at the Copper Fox (−10 silver)');
  commit();
  return '';
}

/** Lunar Tower: draw a card, gain foraging points equal to half its value. */
export function lunarTower() {
  const t = trip();
  if (!t) return null;
  const card = drawOne();
  if (!card) return null;
  const n = Math.floor(card.rank / 2);
  t.points += n;
  let found = false;
  const r = t.target && getReagent(t.target);
  if (r && t.locale) {
    const v = valueNow(r, t.locale);
    if (v != null && t.points >= v) { found = true; play().stock[r.id] = (play().stock[r.id] || 0) + 1; t.points = 0; }
  }
  addLog('apo', `🌙 Lunar Tower: ${card.short} → +${n} foraging points${found ? `, found ${r.name}!` : ''}`);
  commit();
  return { card: card.short, n, found };
}

/** Bits & Bobs: Timer −1, draw 3 cards = the values of what's for sale. */
export function bitsAndBobs() {
  if (trip() && !hasItem('mimic')) tick();
  const cards = [drawOne(), drawOne(), drawOne()].filter(Boolean);
  const shop = { cards: cards.map((c) => ({ short: c.short, rank: c.rank, red: c.red })) };
  play().shop = shop;
  addLog('apo', `🛍 Bits & Bobs has stock for ${cards.map((c) => c.short).join(' ')}`);
  commit();
  return shop;
}
/** Price: 2 silver × the reagent's highest foraging value. */
export const shopPrice = (r) => 2 * Math.max(...r.locales.map((l) => l.value));
export function shopBuy(i, reagentId) {
  const p = play(), r = getReagent(reagentId);
  const price = shopPrice(r);
  if (p.silver < price) return `Not enough silver (${price}).`;
  p.silver -= price;
  collect(r, `bought for ${price} silver`);
  p.shop.cards[i].sold = r.name;
  commit();
  return '';
}

/**
 * Ritual Circle (needs an Athame; once per ailment; Timer −1):
 * sacrifice reagents whose values add up to at least the new one's.
 */
export function ritual(targetId, sacrificeIds) {
  const p = play(), t = trip(), target = getReagent(targetId);
  if (!hasTool('athame')) return 'You need an Athame.';
  if (t?.ritualUsed) return 'Only once per ailment.';
  const sum = sacrificeIds.reduce((s, id) => s + (bestValue(getReagent(id)) || 0), 0);
  const need = bestValue(target) || 0;
  if (sum < need) return `The sacrifice adds up to ${sum}; ${target.name} needs ${need}.`;
  for (const id of sacrificeIds) p.stock[id] = Math.max(0, (p.stock[id] || 0) - 1);
  if (t) { t.ritualUsed = true; if (!hasItem('mimic')) tick(); }
  collect(target, 'Ritual Circle');
  commit();
  return '';
}

// ---------------------------------------------------------------
// Witch clues
// ---------------------------------------------------------------
function jokerDrawn() {
  play().seasonJoker = true;
  play().pendingClue = true;
  addLog('apo', '🃏 Joker: you find a clue about the old witch', `Stage: ${WITCH_STAGES[play().witchStage]}`);
}

export function rollClue() {
  const p = play();
  const id = state.apo.witchTables?.[p.witchStage];
  const t = id && getTable(id);
  if (!t) return { message: `Link a table for "${WITCH_STAGES[p.witchStage]}" in ⚙︎ Setup.` };
  const r = rollTable(t);
  p.clues.push({ week: p.week, stage: p.witchStage, text: r.text });
  p.pendingClue = false;
  addLog('apo', `🔎 Witch clue (${WITCH_STAGES[p.witchStage]}, ${r.shown})`, r.text);
  commit();
  return r;
}

// ---------------------------------------------------------------
// Brewing
// ---------------------------------------------------------------
/**
 * Check a potion. `picks` = [{ reagentId, part }] (one part per reagent).
 * `extras` = { helpful: 'sweet'|'poison'|'', hive: bool, sunSugar: bool, moonstone: bool }
 */
export function checkPotion(picks, extras = {}, which = 'main') {
  const p = play();
  const far = which === 'far' && p.patient?.far;
  const a = far ? getAilment(far.ailmentId) : patientAilment();
  const causes = new Set();
  let poison = 0, sweet = 0;
  const problems = [];
  const free = freeReagents();
  const offered = []; // [{ r, tags, pot, any }]
  for (const { reagentId, part } of picks) {
    const r = getReagent(reagentId);
    if (!r) continue;
    const pr = r.parts.find((x) => x.part === part) || r.parts[0];
    poison += r.poison || 0;
    sweet += r.sweet || 0;
    if (!free.has(reagentId) && (p.stock[reagentId] || 0) < 1) problems.push(`${r.name} isn't in your stock`);
    if (!pr) continue;
    for (const m of pr.methods) {
      const tool = TOOLS.find((t) => t.method === m);
      if (tool && !hasTool(tool.id)) problems.push(`${r.name}: needs a ${tool.name} to ${m}`);
    }
    if (r.pot == null) problems.push(`${r.name} has no ★ potency set (counted as ★)`);
    offered.push({ r, tags: pr.tags.filter((t) => t !== 'ANY'), any: pr.tags.includes('ANY'), pot: r.pot ?? 1 });
    (pr.causes || []).forEach((c) => causes.add(c));
  }
  for (const t of a.tags) if (t.pot == null) problems.push(`[${t.tag}] has no ★ potency set (counted as ★)`);
  // Easing gear (e.g. a hot tub): required potency −1 for some tags.
  const eased = new Set(customOn().flatMap((c) => String(c.ease || '').toUpperCase().split(/[\s,]+/).filter(Boolean)));
  const need = (t) => Math.max(1, (t.pot ?? 1) - (eased.has(t.tag) ? 1 : 0));
  // A tag listed twice ([CURSE] [CURSE]) needs that many SEPARATE reagents.
  const used = new Set();
  const tags = a.tags.map((t) => {
    const hit = offered.find((o) => !used.has(o) && o.tags.includes(t.tag) && o.pot >= need(t));
    if (hit) used.add(hit);
    const best = Math.max(0, ...offered.filter((o) => o.tags.includes(t.tag)).map((o) => o.pot));
    return { ...t, need: need(t), have: best, ok: !!hit };
  });
  // "A [TAG] of your choosing" covers one tag that's still missing.
  for (const o of offered.filter((x) => x.any && !used.has(x))) {
    const miss = tags.find((t) => !t.ok && o.pot >= t.need);
    if (miss) { miss.ok = true; miss.wild = o.r.name; used.add(o); }
  }
  // "Requires: Golden Bark & …" — specific reagents.
  const names = picks.map((x) => getReagent(x.reagentId)?.name.toLowerCase());
  const needs = (a.needs || []).map((n) => ({ name: n, ok: names.includes(n.toLowerCase()) }));
  const special = !a.tags.length && !needs.length; // cure described only in the text
  // Extras
  if (extras.hive && p.hiveUses > 0 && hasUpgrade('hive')) sweet += 1;
  if (extras.sunSugar && hasItem('sunSugar')) sweet += 3;
  if (extras.helpful === 'sweet' && skillCount('helpful')) sweet += 1;
  if (extras.helpful === 'poison' && skillCount('helpful')) poison = Math.max(0, poison - 1);
  if (extras.moonstone && (p.items.moonstone || 0) > 0) poison = 0;
  const net = poison - sweet;
  const cured = special || (tags.every((t) => t.ok) && needs.every((n) => n.ok));
  const toxic = net >= 5;
  const tier = tierOf(p.rep);
  const base = PAY[tier] ?? 20;
  let pay = cured && !toxic ? Math.max(0, base - 4 * net) + (hasUpgrade('treatment') ? 10 : 0) : 0;
  if (far && (far.timer == null || far.timer > 0)) pay *= 2; // Raven Loft: double, if in time
  const silver = Math.floor(pay * (1 + 0.5 * skillCount('shrewd')));
  const counts = TIERS.indexOf(a.tier) >= TIERS.indexOf(tier);
  let rep = 0;
  if (cured && !toxic && counts) rep += 1;
  if (toxic) rep -= 1;
  if (!far && !a.timer && !a.timerText && p.patient.turns > NO_TIMER_LIMIT) rep -= 1;
  return { ailment: a, tags, needs, special, cured, toxic, poison, sweet, net, silver, rep, base, counts, causes: [...causes], problems };
}

/** Give a potion to the far-away (Raven Loft) patient. No week passes. */
export function finishFar(picks, extras = {}) {
  const p = play(), far = p.patient?.far;
  if (!far || far.done) return null;
  const c = checkPotion(picks, extras, 'far');
  const free = freeReagents();
  for (const { reagentId } of picks) if (!free.has(reagentId)) p.stock[reagentId] = Math.max(0, (p.stock[reagentId] || 0) - 1);
  if (extras.hive && p.hiveUses > 0 && hasUpgrade('hive')) p.hiveUses--;
  if (extras.moonstone && (p.items.moonstone || 0) > 0) p.items.moonstone--;
  const silver = c.cured && !c.toxic ? c.silver : 0;
  p.silver += silver;
  p.rep = Math.max(0, p.rep + c.rep);
  far.done = true;
  far.result = c.cured && !c.toxic ? `Cured! +${silver} silver` : 'Not cured: the Consequence happens';
  p.history.push({ week: p.week, ailment: `${c.ailment.name} (far away)`, result: far.result, silver, rep: c.rep });
  addLog('apo', `🐦 Far-away patient, ${c.ailment.name}: ${far.result}`, !c.cured || c.toxic ? `Consequence: ${c.ailment.consequence || '—'}` : '');
  commit();
  return c;
}

/**
 * Finish the patient: 'cured' (give the potion) or 'failed'.
 * Stock is used up (reagents from upgrades/Ways are free). A week passes.
 */
export function finishPatient(picks, result, extras = {}) {
  const p = play(), a = patientAilment();
  let silver = 0, rep = 0, line;
  if (result === 'cured') {
    const c = checkPotion(picks, extras);
    rep = c.rep;
    const free = freeReagents();
    for (const { reagentId } of picks) if (!free.has(reagentId)) p.stock[reagentId] = Math.max(0, (p.stock[reagentId] || 0) - 1);
    if (extras.hive && p.hiveUses > 0 && hasUpgrade('hive')) p.hiveUses--;
    if (extras.moonstone && (p.items.moonstone || 0) > 0) p.items.moonstone--;
    silver = c.cured && !c.toxic ? c.silver : 0;
    p.silver += silver;
    line = c.toxic ? 'Potion was too poisonous: no pay, and the Consequence happens'
      : c.cured ? `Cured! +${silver} silver${rep > 0 ? ', +1 Reputation' : ''}` : 'The potion missed something: the Consequence happens';
    if (!c.cured || c.toxic) addLog('apo', `Consequence: ${a.consequence || '—'}`);
  } else {
    line = 'Not cured: the Consequence happens';
    if (!a.timer && !a.timerText && p.patient.turns > NO_TIMER_LIMIT) rep -= 1;
    addLog('apo', `Consequence: ${a.consequence || '—'}`);
  }
  const far = p.patient.far;
  if (far && !far.done) {
    const fa = getAilment(far.ailmentId);
    p.history.push({ week: p.week, ailment: `${fa?.name} (far away)`, result: 'Not cured: the Consequence happens', silver: 0, rep: 0 });
    addLog('apo', `🐦 Far-away patient, ${fa?.name}: not cured`, `Consequence: ${fa?.consequence || '—'}`);
  }
  p.rep = Math.max(0, p.rep + rep);
  p.history.push({ week: p.week, ailment: a.name, who: p.patient.who, result: line, silver, rep });
  addLog('apo', `🧪 ${a.name}${p.patient.who ? ` (${p.patient.who})` : ''}: ${line}`, rep < 0 ? `Reputation ${rep}` : '');
  p.patient = null;
  return advanceWeek(line);
}

// ---------------------------------------------------------------
// Downtime (between ailments): 6 steps, then a week passes
// ---------------------------------------------------------------
export function startDowntime() {
  const p = play();
  p.downtime = { ...newTrip(DOWNTIME_STEPS), apprenticesDone: [] };
  addLog('apo', '☕ Downtime begins (6 steps)');
  commit();
}

/** Spend a step with a character (no reagents from this). */
export function spendTime(who) {
  tick();
  addLog('apo', `💬 Spent time with ${who || 'someone'}`);
  commit();
}

/** An apprentice collects one reagent per downtime. */
export function apprenticeCollect(apprenticeId, reagentId) {
  const d = play().downtime, r = getReagent(reagentId);
  if (!d || !r || d.apprenticesDone.includes(apprenticeId)) return;
  d.apprenticesDone.push(apprenticeId);
  const ap = play().apprentices.find((a) => a.id === apprenticeId);
  collect(r, `collected by ${ap?.name || 'your apprentice'}`);
  commit();
}

export function endDowntime() {
  play().downtime = null;
  return advanceWeek('Downtime over: a week passes');
}

// ---------------------------------------------------------------
// Calendar & festivals
// ---------------------------------------------------------------
export function advanceWeek(reason = '') {
  const p = play();
  const before = calendar(p.week);
  p.week += 1;
  const after = calendar(p.week);
  const notes = [];
  if (after.season !== before.season) {
    p.festival = { name: FESTIVALS[before.season], season: before.season, games: {} };
    p.hiveUses = 4;
    golemSeasonEnd(notes);
    notes.push(`🎉 ${FESTIVALS[before.season]}!`);
    if (!p.seasonJoker) { notes.push('🔎 No Joker this season: you find a Witch clue.'); p.pendingClue = true; }
    p.seasonJoker = false;
    addLog('apo', `🎉 ${before.season} ends: ${FESTIVALS[before.season]}`, notes.slice(1).join(' '));
    notes.push('Upgrades can be re-planted now (start of a season).');
  }
  commit();
  return { reason, notes, ...after };
}

export function endFestival() { play().festival = null; commit(); }

// ---------------------------------------------------------------
// Golem Helper: one task a season, done when the season ends
// ---------------------------------------------------------------
export const GOLEM_TASKS = {
  tend: 'Tend: double what Garden Plots, Hives and Paddocks give this season (Hive: 8 boosts)',
  make: 'Make: build one Upgrade for free (finished at the end of the season)',
  search: 'Search: up to 10 reagents on a list, one of each brought back at the end of the season',
};
export function setGolem(changes) { Object.assign(play().golem, changes); commit(); }

function golemSeasonEnd(notes) {
  const p = play(), g = p.golem;
  if (!hasItem('golem') || !g.task) return;
  if (g.task === 'make' && g.make) {
    p.upgrades.push({ id: uid(), type: g.make, reagents: [], locales: [] });
    if (g.make === 'spareroom') p.apprentices.push({ id: uid(), name: 'Apprentice', skill: '', tool: '', ways: '' });
    notes.push(`🗿 The golem finished your ${UPGRADES.find((u) => u.id === g.make)?.name}.`);
    g.make = '';
  } else if (g.task === 'search') {
    const list = (g.search || []).filter(Boolean).slice(0, 10);
    for (const id of list) p.stock[id] = (p.stock[id] || 0) + 1;
    if (list.length) notes.push(`🗿 The golem returns with ${list.map((id) => getReagent(id)?.name).filter(Boolean).join(', ')}.`);
  }
  if (g.task === 'tend') p.hiveUses = 8; // next season's honey, doubled
  addLog('apo', '🗿 Golem', notes.filter((n) => n.startsWith('🗿')).join(' ') || GOLEM_TASKS[g.task]);
}

// ---------------------------------------------------------------
// Quests & counters (curses, ALERT, Certainty, Treats, Hurt…)
// ---------------------------------------------------------------
export function addCounter(name, max = null) {
  play().counters.push({ id: uid(), name: name || 'Counter', value: 0, max: max ? +max : null });
  commit();
}
export function adjustCounter(id, delta) {
  const c = play().counters.find((x) => x.id === id);
  if (c) { c.value = Math.max(0, c.value + delta); commit(); }
}
export function removeCounter(id) { play().counters = play().counters.filter((x) => x.id !== id); commit(); }
/** Patients cured so far (some expansions count them). */
export const curedCount = () => play().history.filter((h) => /^Cured/.test(h.result)).length;

// ---------------------------------------------------------------
// Effects from events, for the rest of this forage / downtime
// ---------------------------------------------------------------
/** key: 'points' (per miss), a reagent type ('PLANT'…), or 'all' (every value). */
export function tripMod(k, delta) {
  const t = trip();
  if (!t) return;
  t.mods ||= {};
  t.mods[k] = (t.mods[k] || 0) + delta;
  if (!t.mods[k]) delete t.mods[k];
  commit();
}

// ---------------------------------------------------------------
// Your own gear
// ---------------------------------------------------------------
export function addCustom(rec) { play().custom.push({ id: uid(), on: true, ...rec }); commit(); }
export function updateCustom(id, changes) { Object.assign(play().custom.find((c) => c.id === id) || {}, changes); commit(); }
export function removeCustom(id) { play().custom = play().custom.filter((c) => c.id !== id); commit(); }

// ---------------------------------------------------------------
// Shops (card tables like The Modern Witch Catalogue)
// ---------------------------------------------------------------
/** Browse a shop: (a downtime step) draw cards, show what's in stock. */
export function browseShop(tableId, n = 5) {
  const t = getTable(tableId);
  if (!t) return null;
  if (play().downtime) tick();
  const items = [];
  for (let i = 0; i < n; i++) {
    const { card } = drawNonJoker();
    if (!card) break;
    const r = rollTable(t, 0, [], card.rank, card.id[0]);
    const price = +(r.text.match(/(\d+)\s*Silver/i)?.[1] || 0);
    const name = r.text.split(/\s[–-]\s|\.\s/)[0].slice(0, 60);
    items.push({ card: card.short, red: card.red, text: r.text, name, price, bought: false });
  }
  play().browse = { tableId, name: t.name, items };
  addLog('apo', `🛍 ${t.name}: ${items.map((x) => `${x.card} ${x.name}`).join(' · ')}`);
  commit();
  return play().browse;
}
export function buyProduct(i) {
  const p = play(), it = p.browse?.items[i];
  if (!it || it.bought) return '';
  if (p.silver < it.price) return `Not enough silver (${it.price}).`;
  p.silver -= it.price;
  it.bought = true;
  p.owned.push({ name: it.name, price: it.price, week: p.week, text: it.text });
  addLog('apo', `🛒 Bought ${it.name}${it.price ? ` (−${it.price} silver)` : ''}`);
  commit();
  return '';
}
export function removeOwned(i) { play().owned.splice(i, 1); commit(); }
export const getShopTable = (id) => (id ? getTable(id) : null);

// ---------------------------------------------------------------
// Fishing (The Cursed Coast): a GRID table, one column per place.
// Downtime, Timer −1: draw a card (Jokers are clues), add your rod's
// bonus (you choose 0 up to its maximum) and any chum (+2), and catch
// what the chosen column lists for that number.
// ---------------------------------------------------------------
export const RODS = [
  { id: 'beginner', name: "Beginner's Rod", price: 10, bonus: 0 },
  { id: 'pro', name: 'Pro Rod', price: 70, bonus: 2 },
  { id: 'legendary', name: 'Legendary Rod', price: 0, bonus: 4 },
];
export const CHUM_PRICE = 5;
export const fishingTable = () => (state.apo.fishingTable ? getTable(state.apo.fishingTable) : null);
/** Columns that need a boat (set in Setup). */
export const needsBoat = (col) => !!state.apo.fishingBoat?.[col];

export function setFishing(changes) { Object.assign(play().fishing, changes); commit(); }

/** Look a number up in a column without rolling nested tables yet. */
function catchAt(table, col, n) {
  const c = table.columns?.find((x) => x.name === col);
  const e = (c?.entries || table.entries).find((x) => n >= x.min && n <= x.max);
  return e ? e.text : '';
}

/** Cast your line. Returns { message } on a problem, else the draw. */
export function fishDraw(col, chum = false) {
  const p = play(), t = fishingTable();
  const rod = RODS.find((r) => r.id === p.fishing.rod);
  if (!t) return { message: 'Link your fishing grid table in ⚙︎ Setup first.' };
  if (!rod) return { message: 'You need a fishing rod (🏡 Home → Fishing gear).' };
  if (needsBoat(col) && !p.fishing.boat) return { message: `You need a boat to fish in ${col}.` };
  if (p.downtime?.fishingOver) return { message: 'Your fishing is over for this downtime.' };
  if (chum) {
    if (p.silver < CHUM_PRICE) return { message: `Chum costs ${CHUM_PRICE} silver.` };
    p.silver -= CHUM_PRICE;
  }
  const { card } = drawNonJoker();
  if (!card) return { message: 'The deck is empty. Reshuffle it on the Cards screen.' };
  if (p.downtime) tick();
  const base = card.rank + (chum ? 2 : 0);
  const options = [];
  for (let b = 0; b <= rod.bonus; b++) options.push({ total: base + b, bonus: b, text: catchAt(t, col, base + b) });
  p.lastFish = { card: card.short, red: card.red, col, chum, options, taken: null };
  addLog('apo', `🎣 Fishing in ${col}: ${card.short}${chum ? ' + chum' : ''}${rod.bonus ? ` (rod can add up to ${rod.bonus})` : ''}`);
  commit();
  return p.lastFish;
}

/**
 * Keep the catch for option i. Applies what the text says it can:
 * "Gain N Silver", "Gain/Lose N Reputation", a reagent of that name
 * goes into stock, nested [[Tables]] are rolled, "End Fishing" stops.
 */
export function takeCatch(i) {
  const p = play(), f = p.lastFish, t = fishingTable();
  if (!f || f.taken != null || !t) return null;
  const o = f.options[i];
  let text = o.text;
  const steps = [];
  if (/\[\[/.test(text)) text = rollTable(columnTable(t, f.col), 0, steps, o.total).text;
  const notes = [];
  const silver = text.match(/Gain\s+(\d+)\s+Silver/i);
  if (silver) notes.push(`+${gain(+silver[1])} silver`);
  const rep = text.match(/(Gain|Lose)\s+(\d+)\s+Reputation/i);
  if (rep) { const d = (rep[1].toLowerCase() === 'lose' ? -1 : 1) * +rep[2]; p.rep = Math.max(0, p.rep + d); notes.push(`${d > 0 ? '+' : ''}${d} Reputation`); }
  // The catch's name is the text before any "(…)".
  const name = text.split('(')[0].trim().toLowerCase();
  const r = name && state.apo.reagents.find((x) => x.name.toLowerCase() === name);
  if (r) { p.stock[r.id] = (p.stock[r.id] || 0) + 1; notes.push(`${r.name} added to stock`); }
  if (/End\s+Fishing/i.test(text)) { if (p.downtime) p.downtime.fishingOver = true; notes.push('fishing is over for now'); }
  if (p.fishing.bulb && r) notes.push('caught alive (Capture Bulb)');
  f.taken = i;
  f.result = { text, notes };
  addLog('apo', `🐟 Caught (${o.total}): ${text}`, notes.join(' · '));
  commit();
  return f.result;
}

// ----- festival mini-games (card draws described in the book) -----
const bjValue = (cards) => {
  // Blackjack: J/Q/K = 10, Ace = 11 unless that busts.
  let total = 0, aces = 0;
  for (const r of cards) { if (r === 1) { aces++; total += 11; } else total += Math.min(10, r); }
  while (total > 21 && aces--) total -= 10;
  return total;
};
export { bjValue };

/**
 * Run one festival game. Returns { text, won } and records it.
 * kind: crown (K/Q wins the season's crown), rowboat, snowball, sled,
 *       speech, bake-start / bake-hit / bake-stay
 */
export function festivalGame(kind) {
  const p = play(), f = p.festival;
  if (!f) return null;
  const draw = () => drawOne()?.rank || 0;
  let text = '', won = false;
  if (kind === 'crown') {
    const r = draw();
    won = r >= 12;
    const item = f.season === 'Spring' ? 'flowerCrown' : 'crownOfBones';
    if (won) p.items[item] = true;
    text = `You drew ${rankName(r)}. ${won ? `You win ${ITEMS.find((i) => i.id === item).name}!` : 'Not this year.'}`;
  } else if (kind === 'rowboat') {
    const you = [draw(), draw()], champ = [draw(), draw()], chall = [draw(), draw()];
    const best = (h) => Math.max(...h);
    won = best(you) > best(champ) && best(you) > best(chall);
    if (won) p.items.batasOar = true;
    text = `You ${you.map(rankName).join(' ')} · Champion ${champ.map(rankName).join(' ')} · Challenger ${chall.map(rankName).join(' ')}. ${won ? "You win Bata's Oar (and you're next year's champion)!" : 'Someone else takes it.'}`;
  } else if (kind === 'snowball') {
    const you = Array.from({ length: 5 }, draw), them = Array.from({ length: 4 }, draw);
    const a = you.reduce((x, y) => x + y, 0), b = them.reduce((x, y) => x + y, 0);
    won = a > b;
    text = `Your side ${a} vs ${b}. ${won ? 'Bragging rights are yours!' : 'The other side wins.'}`;
  } else if (kind === 'sled') {
    const r = draw();
    won = r >= 10;
    const g = won ? gain(20) : 0;
    text = `You drew ${rankName(r)}. ${won ? `You win the race! +${g} silver.` : 'You tumble into a snowbank.'}`;
  } else if (kind === 'speech') {
    const g = gain(100);
    text = `The village thanks you: +${g} silver.`;
    won = true;
  } else if (kind === 'bake-start') {
    f.bake = { you: [draw(), draw()], them: [draw(), draw(), draw()], done: false };
    text = `Your cards: ${f.bake.you.map(rankName).join(' ')} (${bjValue(f.bake.you)})`;
  } else if (kind === 'bake-hit' && f.bake && !f.bake.done) {
    f.bake.you.push(draw());
    const v = bjValue(f.bake.you);
    text = `Your cards: ${f.bake.you.map(rankName).join(' ')} (${v})`;
    if (v > 21) { f.bake.done = true; text += ' — bust!'; }
  } else if (kind === 'bake-stay' && f.bake && !f.bake.done) {
    f.bake.done = true;
    const a = bjValue(f.bake.you), b = bjValue(f.bake.them);
    won = a <= 21 && (b > 21 || a > b);
    if (won) p.items.sunSugar = true;
    text = `You ${a} vs competitors ${f.bake.them.map(rankName).join(' ')} (${b}). ${won ? 'You win a year of Sun Sugar!' : 'Not your year.'}`;
  }
  f.games[kind.split('-')[0]] = text;
  addLog('apo', `🎉 ${f.name}: ${text}`);
  commit();
  return { text, won };
}
const rankName = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] || String(r));

// ---------------------------------------------------------------
// Home: tools, upgrades, items, familiar, apprentices
// ---------------------------------------------------------------
export function buyTool(id) {
  const t = TOOLS.find((x) => x.id === id), p = play();
  if (!t || p.tools.includes(id)) return 'You already have that.';
  if (p.silver < t.price) return `Not enough silver (${t.price} needed).`;
  p.silver -= t.price;
  p.tools.push(id);
  addLog('apo', `🛒 Bought a ${t.name} (−${t.price} silver)`);
  commit();
  return '';
}

export function toggleTool(id) {
  const p = play();
  p.tools = p.tools.includes(id) ? p.tools.filter((x) => x !== id) : [...p.tools, id];
  commit();
}

/** Build an upgrade (pay = true takes silver). */
export function addUpgrade(type, pay = true) {
  const u = UPGRADES.find((x) => x.id === type), p = play();
  if (pay) {
    if (u.minRep && p.rep < u.minRep) return `Needs Reputation ${u.minRep}+.`;
    if (p.silver < u.price) return `Not enough silver (${u.price} needed).`;
    p.silver -= u.price;
  }
  p.upgrades.push({ id: uid(), type, reagents: [], locales: [] });
  if (type === 'spareroom') p.apprentices.push({ id: uid(), name: 'Apprentice', skill: '', tool: '', ways: '' });
  addLog('apo', `🔨 Built a ${u.name}${pay ? ` (−${u.price} silver)` : ''}`);
  commit();
  return '';
}

export function removeUpgrade(id) {
  const p = play();
  p.upgrades = p.upgrades.filter((u) => u.id !== id);
  commit();
}

/** Which reagents may go into this kind of upgrade? */
export function upgradeChoices(type) {
  const u = UPGRADES.find((x) => x.id === type);
  if (!u?.hold) return [];
  const h = u.hold;
  return state.apo.reagents.filter((r) => (!h.type || r.type === h.type)
    && (!h.locale || r.locales.some((l) => key(l.name) === h.locale))
    && (!h.max || (Math.min(...r.locales.map((l) => l.value)) <= h.max)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setUpgradeReagents(id, reagentIds) {
  const u = play().upgrades.find((x) => x.id === id);
  const def = UPGRADES.find((x) => x.id === u.type);
  u.reagents = reagentIds.slice(0, def.hold?.n || 0); // keeps empty slots in place
  commit();
}

export function setUpgradeLocales(id, locales) {
  play().upgrades.find((x) => x.id === id).locales = locales.slice(0, 2);
  commit();
}

export function setItem(id, value) {
  const p = play();
  if (!value) delete p.items[id]; else p.items[id] = value;
  commit();
}

/** Familiar or apprentice fields. who = 'familiar' or an apprentice id. */
export function setHelper(who, changes) {
  const p = play();
  if (who === 'familiar') p.familiar = { ...(p.familiar || { name: '', form: '', skill: '', tool: '', ways: '' }), ...changes };
  else Object.assign(p.apprentices.find((a) => a.id === who) || {}, changes);
  commit();
}

/** Draw a card for a skill (A … 10, J, Q/K). */
export function drawSkill(who) {
  const c = drawOne();
  if (!c) return null;
  const s = skillForRank(c.rank);
  setHelper(who, { skill: s.id });
  addLog('apo', `🐾 ${who === 'familiar' ? 'Familiar' : 'Apprentice'} skill: ${c.short} → ${s.name} (${s.note})`);
  return { card: c.short, skill: s };
}

/** Draw a form from the linked "familiar forms" card table. */
export function drawForm() {
  const id = state.apo.familiarTable;
  const t = id && getTable(id);
  if (!t) return { message: 'Link a "familiar forms" table in ⚙︎ Setup, or type the form yourself.' };
  const r = rollTable(t);
  setHelper('familiar', { form: r.text });
  addLog('apo', `🐾 Familiar form: ${r.shown} → ${r.text}`);
  return r;
}

export function removeApprentice(id) { play().apprentices = play().apprentices.filter((a) => a.id !== id); commit(); }
export function addApprentice() { play().apprentices.push({ id: uid(), name: 'Apprentice', skill: '', tool: '', ways: '' }); commit(); }

// ---------------------------------------------------------------
// Small setters
// ---------------------------------------------------------------
export function setStock(reagentId, n) {
  const p = play();
  if (n <= 0) delete p.stock[reagentId]; else p.stock[reagentId] = n;
  commit();
}

export function adjust(field, delta) {
  const p = play();
  p[field] = Math.max(field === 'week' ? 1 : 0, (p[field] || 0) + delta);
  commit();
}

export function toggleUnlock(name) {
  const p = play();
  const k = key(name);
  p.unlocked = p.unlocked.map(key).includes(k) ? p.unlocked.filter((x) => key(x) !== k) : [...p.unlocked, name];
  commit();
}

export function setWitchStage(n) { play().witchStage = Math.max(0, Math.min(3, n)); commit(); }
export function setWho(text) { if (play().patient) { play().patient.who = text; save('apoPlay'); } }
export function dropPatient() { play().patient = null; commit(); }
export function linkNpc(npcId) { if (play().patient) { play().patient.npcId = npcId; commit(); } }
export { key as localeKey };

// ---------------------------------------------------------------
// Obsidian: one "Apothecary" note for this campaign
// ---------------------------------------------------------------
export function apothecaryNote() {
  const p = play(), cal = calendar();
  const name = (id) => getReagent(id)?.name || '(deleted)';
  const lines = [
    '---', 'tabletop-kit: apothecary', `updated: ${new Date().toISOString().slice(0, 10)}`, '---',
    '# Apothecary', '',
    `**Reputation** ${p.rep} (${tierOf(p.rep)}) · **Silver** ${p.silver} · **Week** ${cal.week} of ${cal.season}, year ${cal.year}`, '',
    '## Home',
    `- Tools: ${TOOLS.filter((t) => hasTool(t.id)).map((t) => t.name).join(', ') || '—'}`,
    ...p.upgrades.map((u) => {
      const d = UPGRADES.find((x) => x.id === u.type);
      const inside = [...(u.reagents || []).filter(Boolean).map(name), ...(u.locales || []).filter(Boolean)].join(u.type === 'travelstone' ? ' ↔ ' : ', ');
      return `- ${d?.name || u.type}${inside ? `: ${inside}` : ''}`;
    }),
    ...ITEMS.filter((i) => p.items[i.id]).map((i) => `- ${i.name}${i.uses ? ` (${p.items[i.id]} uses left)` : ''}`),
    '',
    ...p.custom.map((c) => `- ${c.name}${c.note ? `: ${c.note}` : ''}${c.on === false ? ' (off)' : ''}`),
    ...p.owned.map((o) => `- ${o.name}`),
    '',
    ...(p.counters.length ? ['## Quests & counters', ...p.counters.map((c) => `- ${c.name}: ${c.value}${c.max ? `/${c.max}` : ''}`), `- Patients cured: ${curedCount()}`, ''] : []),
    '## Familiar & apprentices',
    ...[p.familiar ? { ...p.familiar, role: 'Familiar' } : null, ...p.apprentices.map((a) => ({ ...a, role: 'Apprentice' }))].filter(Boolean)
      .map((h) => `- **${h.role}**: ${h.name || '—'}${h.form ? ` (${h.form})` : ''}${h.skill ? ` · ${SKILLS.find((s) => s.id === h.skill)?.name}` : ''}`),
    '',
    '## Stock',
    ...Object.entries(p.stock).filter(([, n]) => n > 0).map(([id, n]) => `- ${name(id)} ×${n}`),
    ...[...freeReagents()].map((id) => `- ${name(id)} (always available)`),
    '',
    '## Patients',
    ...p.history.slice(-20).reverse().map((h) => { const c = calendar(h.week); return `- W${c.week} ${c.season} Y${c.year}: **${h.ailment}**${h.who ? ` (${h.who})` : ''} — ${h.result}`; }),
    '',
    '## The old witch',
    `Stage: ${WITCH_STAGES[p.witchStage]}`,
    ...p.clues.map((c) => `- (${WITCH_STAGES[c.stage]}) ${c.text}`),
  ];
  return lines.join('\n') + '\n';
}
