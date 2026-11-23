// =============================================================
// state.js — the app's single source of truth (+ campaigns)
// -------------------------------------------------------------
// Everything the app remembers lives in one object, `state`.
// Views read from it to draw the screen; actions change it and
// then call save() + the app re-draws.
//
// Pattern used throughout:
//   state.something = newValue;
//   save('something');      // write that part to IndexedDB
//   emit();                 // tell the app to re-draw
//
// CAMPAIGNS. Data is either GLOBAL (shared by every campaign) or
// belongs to the CURRENT CAMPAIGN. Views don't need to care: they
// always read state.log, state.trackers… and those hold the current
// campaign's data. Switching campaign swaps them out.
//
//   Global   : settings, tables (unless a table is marked for one
//              campaign), Mythic setup (rules + which tables), campaigns
//   Campaign : log, decks, trackers, dice favourites, Mythic play state
//              (chaos, scenes, thread tracks, keyed scenes)
//
// Every new feature must pick one of these two (see DESIGN.md).
// `ui` is separate: temporary screen stuff we don't save.
// =============================================================

import * as store from './store.js';
import { uid } from './rng.js';

// ---------- defaults ----------
const DEFAULT_SETTINGS = {
  theme: 'auto',            // 'auto' | 'dark' | 'light'
  tarotReversals: true,     // can tarot cards come up upside down?
  jokers: true,             // include 2 jokers in the playing-card deck?
  obsidianVault: '',        // vault name ('' = whatever vault is open)
  obsidianTarget: 'daily',  // 'daily' (daily note) | 'file'
  obsidianFile: 'Solo/Session Log',
  exportStyle: 'callout',   // 'callout' | 'plain'
  games: {},                // game modules switched on, e.g. { apothecaria: true } (see games.js)
};

// Mythic is split in two: SETUP is global (you paste the book's
// tables once), PLAY belongs to each campaign.
const MYTHIC_SETUP = {
  method: 'check',        // 'check' = 2d10 Fate Check, 'chart' = d100 Fate Chart
  variant: 'standard',    // 'standard' | 'mid' | 'low' | 'none'
  checkMods: { standard: null, mid: null, low: null, none: null },
  charts: { standard: null, mid: null, low: null, none: null },
  focusTable: '',         // table ids…
  actionTables: [],       // [Actions 1, Actions 2]
  descriptionTables: [],  // [Descriptions 1, Descriptions 2]
  elementsFolder: '',     // every table in this folder = an Elements table
  sceneAdjustTable: '',
  discoveryTable: '',
  defaultMeaning: 'actions',
};
const MYTHIC_PLAY = {
  chaos: 5,
  scene: 0,
  tracks: [],             // Thread Progress Tracks (one per thread)
  activeTrack: null,      // id of the track shown on the Thread tab
  keyed: [],              // Keyed Scenes
  noDiscovery: false,     // Exceptional No on a Discovery Check this scene
};
const SETUP_FIELDS = Object.keys(MYTHIC_SETUP);
const PLAY_FIELDS = Object.keys(MYTHIC_PLAY);

const DEFAULT_DICE = { favorites: ['2d20kh1', '2d20kl1', '4d6kh3', '4dF'] };

// Per-campaign social settings (Let's Talk options for your PC).
const DEFAULT_SOCIAL = {
  wildcard: '',          // a tone your PC leans on ('' = no Wildcard card)
  advancedMoods: true,   // moods have mechanical effects
  hardcore: false,       // only the 3 tone cards drawn at the start
  flirting: true,        // include the Flirting card when allowed
  porting: true,         // Keeping Contact's rule for shifting past the ends of the attitude scale
  volatility: 3,         // Update relationships: d6 result that changes Attitude (3 normal, 4–5 more volatile)
};

// UNE setup is global: which pasted tables fill which slot.
const DEFAULT_UNE = { slots: {}, folder: '' };
// Apothecaria library (pasted from your own book), shared by all campaigns.
const DEFAULT_APO = { reagents: [], ailments: [] };

/** A fresh, empty campaign's data. */
function emptyCampaignData() {
  return {
    log: [],
    decks: {},
    trackers: { counters: [], lists: [] },
    dice: structuredClone(DEFAULT_DICE),
    play: structuredClone(MYTHIC_PLAY),
    npcs: [],              // NPC cards (see npcs.js)
    relations: [],         // NPC↔NPC pairs and faction ties (Keeping Contact)
    factions: [],          // factions you deal with (Keeping Contact)
    social: structuredClone(DEFAULT_SOCIAL),
    dialogue: null,        // a Let's Talk conversation in progress
    apoPlay: null,         // Apothecaria game state (see apoplay.js); created on first use
  };
}

// ---------- live state ----------
export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  tables: [],
  campaigns: { list: [], active: null },
  // current campaign's data:
  log: [],
  decks: {},
  trackers: { counters: [], lists: [] },
  dice: structuredClone(DEFAULT_DICE),
  npcs: [],
  relations: [],
  factions: [],
  social: structuredClone(DEFAULT_SOCIAL),
  dialogue: null,
  apoPlay: null,          // current campaign's Apothecaria game (reputation, silver, week, stock…)
  une: structuredClone(DEFAULT_UNE),      // global
  apo: structuredClone(DEFAULT_APO),      // global: Apothecaria reagents + ailments
  // Mythic setup + current campaign's play state, merged into one
  // object so the Mythic code can simply read state.mythic.chaos etc.
  mythic: { ...structuredClone(MYTHIC_SETUP), ...structuredClone(MYTHIC_PLAY) },
};

export const ui = {
  tab: 'dice',
  results: {},      // last result shown on each screen, by tab id
  drafts: {},       // half-typed text in inputs, so re-draws keep it
};

const GLOBAL_KEYS = ['settings', 'tables', 'campaigns', 'une', 'apo'];
const CAMPAIGN_KEYS = ['log', 'decks', 'trackers', 'dice', 'npcs', 'relations', 'factions', 'social', 'dialogue', 'apoPlay'];
const campaignKey = (id) => `c:${id}`;

// ---------- change notification ----------
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }
export function emit() { listeners.forEach((fn) => fn()); }

// ---------- helpers ----------
const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => obj && f in obj).map((f) => [f, obj[f]]));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const activeCampaign = () => state.campaigns.list.find((c) => c.id === state.campaigns.active) || null;

/** Put a campaign's saved data into the live state. */
function applyCampaignData(data) {
  const d = { ...emptyCampaignData(), ...(data || {}) };
  state.log = d.log || [];
  state.decks = d.decks || {};
  state.trackers = { counters: [], lists: [], ...d.trackers };
  state.dice = { ...structuredClone(DEFAULT_DICE), ...d.dice };
  state.npcs = d.npcs || [];
  state.relations = d.relations || [];
  state.factions = d.factions || [];
  state.social = { ...structuredClone(DEFAULT_SOCIAL), ...d.social };
  state.dialogue = d.dialogue || null;
  state.apoPlay = d.apoPlay || null;
  const setup = pick(state.mythic, SETUP_FIELDS);
  state.mythic = { ...structuredClone(MYTHIC_PLAY), ...d.play, ...setup };
}

/** The live state's campaign data, ready to save. */
function currentCampaignData() {
  return {
    log: state.log, decks: state.decks, trackers: state.trackers, dice: state.dice,
    npcs: state.npcs, relations: state.relations, factions: state.factions,
    social: state.social, dialogue: state.dialogue, apoPlay: state.apoPlay,
    play: pick(state.mythic, PLAY_FIELDS),
  };
}

// ---------- load ----------
export async function load() {
  const settings = await store.get('settings');
  state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(settings || {}) };
  state.tables = (await store.get('tables')) || [];
  state.une = { ...structuredClone(DEFAULT_UNE), ...((await store.get('une')) || {}) };
  state.apo = { ...structuredClone(DEFAULT_APO), ...((await store.get('apo')) || {}) };
  // v0.7.1 showed the Apothecaria tab based on a campaign's Game; keep
  // it on for anyone who already has Apothecaria data.
  if (!settings?.games && (state.apo.reagents.length || state.apo.ailments.length)) state.settings.games = { apothecaria: true };
  const mythicSaved = (await store.get('mythic')) || {};
  state.mythic = { ...structuredClone(MYTHIC_SETUP), ...pick(mythicSaved, SETUP_FIELDS), ...structuredClone(MYTHIC_PLAY) };
  // v0.1 field names, converted by mythic.js migrate()
  for (const old of ['chart', 'meaningTables', 'track']) if (old in mythicSaved) state.mythic[old] = mythicSaved[old];

  const campaigns = await store.get('campaigns');
  if (campaigns && campaigns.list?.length) {
    state.campaigns = campaigns;
    applyCampaignData(await store.get(campaignKey(campaigns.active)));
  } else {
    // FIRST RUN OF v0.3: everything saved so far becomes "Campaign 1".
    const data = {
      log: (await store.get('log')) || [],
      decks: (await store.get('decks')) || {},
      trackers: (await store.get('trackers')) || { counters: [], lists: [] },
      dice: (await store.get('dice')) || structuredClone(DEFAULT_DICE),
      play: { ...structuredClone(MYTHIC_PLAY), ...pick(mythicSaved, PLAY_FIELDS) },
    };
    const c = newCampaignMeta('Campaign 1', 'Mythic');
    state.campaigns = { list: [c], active: c.id };
    applyCampaignData(data);
    // carry an old single track over too
    if (mythicSaved.track !== undefined) state.mythic.track = mythicSaved.track;
    await store.set(campaignKey(c.id), currentCampaignData());
    await store.set('campaigns', state.campaigns);
    await store.set('mythic', pick(state.mythic, SETUP_FIELDS));
    for (const k of CAMPAIGN_KEYS) await store.set(k, null); // old global copies no longer used
  }
}

// ---------- save (debounced) ----------
const pending = new Set();
let timer = null;
export function save(...keys) {
  keys.forEach((k) => pending.add(k));
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
export async function flush() {
  clearTimeout(timer);
  const keys = [...pending];
  pending.clear();
  let campaignDirty = false;
  for (const k of keys) {
    if (GLOBAL_KEYS.includes(k)) await store.set(k, state[k]);
    else if (k === 'mythic') { await store.set('mythic', pick(state.mythic, SETUP_FIELDS)); campaignDirty = true; }
    else if (CAMPAIGN_KEYS.includes(k)) campaignDirty = true;
  }
  if (campaignDirty && state.campaigns.active) {
    await store.set(campaignKey(state.campaigns.active), currentCampaignData());
  }
}
addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

// ---------------------------------------------------------------
// Campaign management
// ---------------------------------------------------------------
function newCampaignMeta(name, game) {
  return {
    id: uid(), name, game: game || '', notes: '', created: Date.now(), archived: false,
    overrides: { method: '', variant: '', obsidianFile: '' }, // '' = use the global setting
  };
}

/**
 * Create a campaign and switch to it.
 *   copyFrom: id of a campaign to copy from (optional)
 *   copy: { lists: bool, tables: bool }
 */
export async function createCampaign({ name, game, copyFrom, copy = {} }) {
  await flush();
  const meta = newCampaignMeta(name || 'New campaign', game);
  const data = emptyCampaignData();
  if (copyFrom) {
    const src = copyFrom === state.campaigns.active ? currentCampaignData() : await store.get(campaignKey(copyFrom));
    if (src && copy.lists) {
      data.trackers = structuredClone(src.trackers);
      data.dice = structuredClone(src.dice || DEFAULT_DICE);
      data.npcs = structuredClone(src.npcs || []);
      data.relations = structuredClone(src.relations || []);
      data.factions = structuredClone(src.factions || []);
      data.social = structuredClone(src.social || DEFAULT_SOCIAL);
    }
    if (copy.tables) {
      for (const t of state.tables.filter((x) => x.campaign === copyFrom)) {
        state.tables.push({ ...structuredClone(t), id: uid(), campaign: meta.id });
      }
      await store.set('tables', state.tables);
    }
  }
  state.campaigns.list.push(meta);
  await store.set(campaignKey(meta.id), data);
  await switchCampaign(meta.id);
  return meta;
}

export async function switchCampaign(id) {
  if (id === state.campaigns.active) return;
  await flush();
  state.campaigns.active = id;
  const c = activeCampaign();
  if (c) c.archived = false;
  applyCampaignData(await store.get(campaignKey(id)));
  await store.set('campaigns', state.campaigns);
  ui.results = {};
  emit();
}

export function updateCampaign(id, changes) {
  const c = state.campaigns.list.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, changes);
  save('campaigns');
  emit();
}

/** Delete a campaign, its data and its campaign-only tables. */
export async function deleteCampaign(id) {
  if (state.campaigns.list.length <= 1) throw new Error("You can't delete your only campaign.");
  if (id === state.campaigns.active) {
    const next = state.campaigns.list.find((c) => c.id !== id && !c.archived) || state.campaigns.list.find((c) => c.id !== id);
    await switchCampaign(next.id);
  }
  state.campaigns.list = state.campaigns.list.filter((c) => c.id !== id);
  state.tables = state.tables.filter((t) => t.campaign !== id);
  await store.set(campaignKey(id), null);
  await store.set('campaigns', state.campaigns);
  await store.set('tables', state.tables);
  emit();
}

/** One campaign (+ its own tables) as a file. */
export async function exportCampaign(id) {
  await flush();
  return {
    format: 'tabletop-kit-campaign',
    version: 1,
    exported: new Date().toISOString(),
    campaign: state.campaigns.list.find((c) => c.id === id),
    data: id === state.campaigns.active ? currentCampaignData() : await store.get(campaignKey(id)),
    tables: state.tables.filter((t) => t.campaign === id),
  };
}

/** Import a campaign file as a NEW campaign (never overwrites). */
export async function importCampaign(obj) {
  if (!obj || obj.format !== 'tabletop-kit-campaign') throw new Error("That file isn't a Tabletop Kit campaign.");
  await flush();
  const meta = { ...newCampaignMeta(obj.campaign?.name || 'Imported campaign'), ...obj.campaign, id: uid(), archived: false };
  for (const t of obj.tables || []) state.tables.push({ ...t, id: uid(), campaign: meta.id });
  state.campaigns.list.push(meta);
  await store.set(campaignKey(meta.id), { ...emptyCampaignData(), ...obj.data });
  await store.set('tables', state.tables);
  await switchCampaign(meta.id);
  return meta;
}

// ---------------------------------------------------------------
// Full backup: everything, every campaign.
// ---------------------------------------------------------------
export async function exportBackup() {
  await flush();
  const campaignData = {};
  for (const c of state.campaigns.list) {
    campaignData[c.id] = c.id === state.campaigns.active ? currentCampaignData() : await store.get(campaignKey(c.id));
  }
  return {
    format: 'tabletop-kit-backup',
    version: 2,
    exported: new Date().toISOString(),
    data: {
      settings: state.settings, tables: state.tables, campaigns: state.campaigns, une: state.une, apo: state.apo,
      mythic: pick(state.mythic, SETUP_FIELDS), campaignData,
    },
  };
}

export async function importBackup(obj) {
  if (!obj || obj.format !== 'tabletop-kit-backup') throw new Error("That file isn't a Tabletop Kit backup.");
  const d = obj.data || {};
  await store.set('settings', { ...DEFAULT_SETTINGS, ...d.settings });
  await store.set('tables', d.tables || []);
  if (obj.version >= 2) {
    await store.set('mythic', d.mythic || {});
    await store.set('une', d.une || {});
    await store.set('apo', d.apo || {});
    for (const [id, data] of Object.entries(d.campaignData || {})) await store.set(campaignKey(id), data);
    await store.set('campaigns', d.campaigns);
  } else {
    // v0.1/v0.2 backup: old layout, migrated by load() like a first run.
    await store.set('mythic', d.mythic || {});
    for (const k of CAMPAIGN_KEYS) await store.set(k, d[k] ?? null);
    await store.set('campaigns', null);
  }
  await load();
  ui.results = {};
}

export { isPlainObject };
