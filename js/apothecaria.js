// =============================================================
// apothecaria.js — the Apothecaria library: reagents & ailments
// -------------------------------------------------------------
// Apothecaria is a paid book, so the app ships NO book content.
// You paste the reagent and ailment pages from your own PDF, and
// these parsers turn them into structured data the app can use.
//
// Saved globally in state.apo (shared by every campaign, like
// tables). Each record remembers its `source` ("Base game", an
// expansion's name…) so expansions can be told apart later.
//
// A REAGENT looks like:
//   { id, source, name, pot, potGuess,    // pot = ★ count; potGuess = not confirmed yet
//     type: 'PLANT' | 'ANIMAL' | 'MAGIC' | …,
//     locales: [{ name: 'Forest', value: 3 }, …],
//     seasons: { Autumn: 1, Winter: 5 },  // added to the foraging value
//     poison: 1, sweet: 0,
//     parts: [{ part: 'Thorns', methods: ['CRUSH','BOIL'], tags: ['MOOD','SENSES'],
//               causes: [] }],          // tags the part GIVES as a side effect
//     requires: 'WAND' | '',              // "Requires a Wand to collect"
//     desc: '' }
//
// An AILMENT looks like:
//   { id, source, tier: 'Novice', rank: 1…13 (A/1 … K),
//     name, tags: [{ tag: 'WOUND', pot: 1, guess }], timer: 6 | null,
//     desc: '', consequence: '' }
// =============================================================

import { state, save, emit } from './state.js';
import { uid } from './rng.js';
import { rankNumber } from './tables.js';

export const TIERS = ['Novice', 'Intermediate', 'Advanced', 'Expert'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------

// Potency can come through a copy/paste in several ways:
//   "★★"  "**"  "☆☆"  or a digit "2". The PDF's star font often
//   turns into plain spaces, in which case we return null and the
//   app asks you to fill it in.
/**
 * Returns { pot, guess }. Potency is only taken from real stars,
 * asterisks or a digit in the text. The book's star font usually
 * doesn't copy (★ → nothing, ★★/★★★ → a line break), so most
 * pasted entries come in as null = "not set", and you set them by
 * hand in the Library. (guess is always false now; it's kept so
 * older saves still load.)
 */
function readPot(s) {
  return { pot: potency(String(s || '').replace(/[⁑?]/g, '')), guess: false };
}

function potency(s) {
  if (!s) return null;
  const digit = s.match(/\d/);
  if (digit) return +digit[0];
  // Count every symbol that isn't a letter, number, space or dash:
  // ★, *, or whatever private glyph the PDF's star font copies as.
  const stars = (s.match(/[^\p{L}\p{N}\s\-–—()[\]|.,:;'’]/gu) || []).length;
  return stars && stars <= 5 ? stars : null;
}

/** "[WOUND ★] [PAIN ★★]" → [{ tag: 'WOUND', pot: 1 }, …] */
function readTags(s) {
  return [...s.matchAll(/\[\s*([A-Za-z][A-Za-z' ]*?)\s*([^\]\[A-Za-z]*)\]/g)]
    .map((m) => { const { pot, guess } = readPot(m[2]); return { tag: m[1].trim().toUpperCase(), pot, guess }; });
}

/** CRUSHED → CRUSH, BOILED → BOIL, DISTILLED → DISTIL, RAW → RAW */
function methodName(w) {
  w = w.toUpperCase();
  if (w.endsWith('LLED')) return w.slice(0, -3);
  if (w.endsWith('ED')) return w.slice(0, -2);
  return w;
}

const isPageNumber = (l) => /^\d{1,3}$/.test(l.trim());

/**
 * Split pasted text into trimmed, non-empty lines. iPad copies can
 * use the Unicode line/paragraph separators, so those count too.
 */
// Placed where a line break was glued back: it stands for the ★★ that
// turned into that break, so potency() reads it as 2 (marked as a guess).
const BREAK_STARS = '⁑⁑';

function splitLines(text) {
  return String(text).split(/\r?\n|\r|\u2028|\u2029/)
    // Book typos like "[TEETH}" or "{TEETH]": treat as a normal [TAG].
    .map((l) => l.trim().replace(/\[([A-Za-z' ]+)\}/g, '[$1]').replace(/\{([A-Za-z' ]+)\]/g, '[$1]'))
    .filter(Boolean);
}
/** After gluing ("Timer:" / "4"), lone numbers left over are page numbers. */
const dropPageNumbers = (lines) => lines.filter((l) => !isPageNumber(l));

/**
 * The book's ★★ glyph can turn into a LINE BREAK when copied, which
 * cuts header lines in two:
 *   "Fairy Dust" / "- MAGIC - Forest (6) - Bog (3)"
 *   "8) Drunk - [BLOOD ] [COLD ] [SENSES" / "] - Timer: 8 Struck by…"
 * This glues such pieces back together before parsing.
 */
function glueBrokenLines(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const opens = prev ? (prev.match(/\[/g) || []).length - (prev.match(/\]/g) || []).length : 0;
    // Only glue an unclosed [TAG when the next line really continues it
    // ("] - Timer: 8…"), not when it's the next reagent's name.
    if (prev && opens > 0 && (/^[^\p{L}\p{N}]/u.test(line) || AILMENT_HEAD.test(prev))) {
      out[out.length - 1] = prev + BREAK_STARS + line;      // unclosed [TAG → continue it
    } else if (prev && /^[^\p{L}\p{N}]*([-–—]\s*)?[A-Z]{3,}\s*[-–—].*\(\d+\)/u.test(line) && !REAGENT_HEAD_LOOSE.test(prev)
      && !prev.includes('[') && !PART.test(prev) && prev.split(/\s+/).length <= 6) {
      // "- TYPE - Locale (n)" → the name was on the line above
      out[out.length - 1] = prev + ' ' + BREAK_STARS + (/^[^\p{L}\p{N}]*[-–—]/u.test(line) ? ' ' : ' - ') + line;
    } else if (prev && /^[^\p{L}\p{N}[]*\[/u.test(line) && AILMENT_START.test(prev) && !/Timer/i.test(prev)) {
      out[out.length - 1] = prev + ' ' + line;              // ailment [TAGS] on the line(s) under its name
    } else if (prev && AILMENT_START.test(prev) && !/Timer/i.test(prev) && /^[-–—]?\s*(Timer|Requires)\s*:/i.test(line)) {
      out[out.length - 1] = prev + ' ' + line;              // "Timer: 6" on its own line
    } else if (prev && /Timer\s*:?\s*$/i.test(prev) && /^\d/.test(line)) {
      out[out.length - 1] = prev + ' ' + line;              // "Timer:" / "4"
    } else if (prev && REAGENT_HEAD.test(prev) && /^\(\d+\)/.test(line)) {
      out[out.length - 1] = prev + ' ' + line;              // "… – Dungeon" / "(10)"
    } else {
      out.push(line);
    }
  }
  return out;
}
const clean = (s) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------
// REAGENTS
// ---------------------------------------------------------------
// Header line: "Name ★ - TYPE - Locale (3) - Locale (5)"
// (the dashes need spaces round them, so "Will-o-Wisp" stays whole)
// Name part = everything before " - TYPE - "; any symbols at its end
// are the ★ potency (however they copied).
const REAGENT_HEAD_LOOSE = /[-–—]\s*[A-Z]{3,}\s*[-–—].*(\(\d+\)|\?\?\?)/;
// The tail is usually "Locale (3) - Locale (5)", but expansions also
// use "???" or "Only Found After …" (kept as a note).
// (Type may carry a "?" or miss the dash after it: "MADE? – Manor (10)", "MADE Valley (5)".)
const REAGENT_HEAD = /^([^[]+?)\s*[-–—]\s*([A-Z]{3,})\??\s*(?:[-–—]\s*|\s(?=[A-Z][a-z]))(.*(?:\(\d+\)|\?\?\?|\b[Oo]nly\b).*)$/u;

/** "Fairy Dust ★★" → { name: 'Fairy Dust', pot: 2 } */
function splitNameStars(raw) {
  const m = raw.trim().match(/^(.*?[\p{L}\p{N})’'])\s*([^\p{L}\p{N}]*)$/u);
  if (!m) return { name: clean(raw), ...readPot('') };
  return { name: clean(m[1]), ...readPot(m[2]) };
}
const REQUIRES = /Requires\s+(?:an?\s+)?(.+?)\s+to\s+collect\.?/i;
// "+1 in Autumn | +5 in Winter", "-3 during Spring and Summer",
// "+10 during Summer, Harvest, and Winter" (Harvest = Autumn).
const SEASON_LINE = /^[+-]\s*\d+\s*(?:in|during)\b/i;
const SEASON_WORD = /\b(spring|summer|autumn|harvest|winter)\b/gi;
const seasonName = (w) => (w.toLowerCase() === 'harvest' ? 'Autumn' : SEASONS.find((s) => s.toLowerCase() === w.toLowerCase()));
const ADDS = /Adds?\s+(\d+)\s+points?\s+of\s+(POISON|SWEET)/gi;
// "Thorns can be CRUSHED for [X]" — the part name is optional
// ("Can be added RAW for…"), and typos like "an be" happen.
const PART = /^(?:(.+?)\s+)?c?an\s+be\s+(.+?)\s+for\s+(.*)$/i;
// Expansions sometimes drop "can be": "Added RAW for [STOMACH] …"
const PART_SHORT = /^()((?:added\s+)?(?:RAW|CRUSHED|BOILED|DISTILLED)\b.*?)\s+for\s+(.*\[.*)$/i;

/**
 * Parse pasted reagent pages. Returns { reagents, warnings }.
 * Anything it can't place goes into the reagent's description, so
 * nothing is silently lost.
 */
export function parseReagents(text) {
  const lines = dropPageNumbers(glueBrokenLines(splitLines(text)));
  const reagents = [];
  let r = null;
  let lastPart = null;

  lines.forEach((line, i) => {
    const head = line.match(REAGENT_HEAD);
    if (head) {
      const { name, pot, guess } = splitNameStars(head[1]);
      r = {
        name, pot, potGuess: guess, type: head[2].toUpperCase(),
        where: /\(\d+\)/.test(head[3]) ? '' : clean(head[3]),   // e.g. "Only Found After Besting …"
        locales: [...head[3].matchAll(/([A-Za-z][A-Za-z' ]*?)\s*\((\d+)\)/g)].map((m) => ({ name: clean(m[1]), value: +m[2] })),
        seasons: {}, poison: 0, sweet: 0, parts: [], desc: '', requires: '',
      };
      reagents.push(r);
      lastPart = null;
      return;
    }
    // A short heading line right before a reagent ("Glimmerwood Grove")
    // is the page title — skip it.
    const next = lines[i + 1];
    if (next && REAGENT_HEAD.test(next) && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 4 && !line.includes('[')) return;
    if (!r) return; // text before the first reagent (page intro)

    if (SEASON_LINE.test(line)) {
      for (const seg of line.split('|')) {
        const n = seg.match(/([+-])\s*(\d+)/);
        if (!n) continue;
        for (const w of seg.matchAll(SEASON_WORD)) r.seasons[seasonName(w[1])] = (n[1] === '-' ? -1 : 1) * +n[2];
      }
      lastPart = null;
      return;
    }
    // "Can only be found during Spring"
    const onlyIn = /only\s+(?:be\s+)?found\s+(?:during|in)\b/i.test(line) ? [...line.matchAll(SEASON_WORD)] : [];
    if (onlyIn.length) {
      r.only = onlyIn.map((w) => seasonName(w[1]));
      lastPart = null;
      return;
    }
    // "…can be added to a Potion to give it 5 Sweet."
    const give = line.match(/give\s+it\s+(\d+)\s+(sweet|poison)/i);
    if (give) { r[give[2].toLowerCase()] += +give[1]; r.desc = clean(r.desc + ' ' + line); lastPart = null; return; }
    // "Requires a Wand to collect" — anywhere in the line (copies sometimes
    // run it into the description). The rest of the line is description.
    const req = line.match(REQUIRES);
    if (req) {
      r.requires = req[1];
      line = clean(line.replace(REQUIRES, ''));
      lastPart = null;
      if (!line) return;
    }
    let adds = false;
    for (const m of line.matchAll(ADDS)) {
      r[m[2].toLowerCase()] += +m[1];
      adds = true;
    }
    if (adds) { lastPart = null; return; }

    // "…removes 1 point of Poison" / "…for 1 point of Sweet" (part lines with Sweet/Poison effects)
    const minus = line.match(/removes?\s+(\d+)\s+points?\s+of\s+(poison|sweet)/i);
    if (minus) r[minus[2].toLowerCase()] -= +minus[1];
    const forPts = line.match(/\bfor\s+(\d+)\s+points?\s+of\s+(sweet|poison)/i);
    if (forPts && !line.includes('[')) { r[forPts[2].toLowerCase()] += +forPts[1]; r.desc = clean(r.desc + ' ' + line); lastPart = null; return; }
    const part = line.match(PART) || line.match(PART_SHORT);
    if (part && part[3].includes('[')) {
      const methods = [...part[2].matchAll(/\b([A-Z]{3,})\b/g)].map((m) => methodName(m[1]));
      // "…for [COUGH] and [HOT] but CAUSES [SLEEP]": tags after CAUSES
      // are a side effect the potion GIVES, not something it cures.
      const [cures, causes = ''] = part[3].split(/\bCAUSES?\b/i);
      // "…for a [TAG] of your choosing" = cures any one tag.
      const any = /of\s+your\s+choosing|any\s+\[?tag/i.test(cures);
      lastPart = { part: clean(part[1] || r.name), methods, tags: any ? ['ANY'] : readTags(cures).map((t) => t.tag),
        causes: readTags(causes).map((t) => t.tag) };
      r.parts.push(lastPart);
      return;
    }
    // A wrapped part line: "…for [BURN], [BOILS]" / "and [RASH]"
    if (lastPart && /^\W*(and\s+|but\s+)?(CAUSES?\s+)?\[/i.test(line)) {
      const [cures, causes = ''] = line.split(/\bCAUSES?\b/i);
      lastPart.tags.push(...readTags(cures).map((t) => t.tag));
      lastPart.causes.push(...readTags(causes).map((t) => t.tag));
      return;
    }
    lastPart = null;
    r.desc = clean(r.desc + ' ' + line);
  });

  const warnings = [];
  const missed = lines.filter((l) => /\(\d+\)/.test(l) && !REAGENT_HEAD.test(l) && /[A-Z]{3,}/.test(l));
  if (missed.length) warnings.push(`These lines look like reagent headers but couldn't be read (please send them to me): ${missed.map((l) => `“${l.slice(0, 80)}”`).join(' · ')}`);
  const unset = reagents.filter((x) => x.pot == null).length;
  if (unset) warnings.push(`${unset} reagent${unset === 1 ? ' has' : 's have'} no ★ potency (the book's stars don't copy). Set them in the Library: tick "Needs ★".`);
  const noParts = reagents.filter((x) => !x.parts.length && !x.poison && !x.sweet).map((x) => x.name);
  if (noParts.length) warnings.push(`No parts found for: ${noParts.map((n) => n.replace(/⁑/g, '')).join(', ')}`);
  return { reagents, warnings };
}

// ---------------------------------------------------------------
// AILMENTS
// ---------------------------------------------------------------
// Header line: "1) Wounded - [WOUND ★] [PAIN ★] - Timer: 6"
//              "J) Hangover - [POISON] [STOMACH] - Timer: 4"
// Card label, optionally a range: "1)", "J)", "1 - 4)", "A & 2)", "9 – Q)".
const LABEL = '(Ace|Jack|Queen|King|1[0-3]|[1-9]|[AJQK])';
const AILMENT_START = new RegExp(`^${LABEL}(?:\\s*(?:[-–—&]|to)\\s*${LABEL})?\\s*[).:]\\s*\\S`, 'i');
// The name, then (after gluing broken lines) the [TAGS] and Timer.
const AILMENT_HEAD = new RegExp(`^${LABEL}(?:\\s*(?:[-–—&]|to)\\s*${LABEL})?\\s*[).:]\\s*(.+?)\\s*(?:[-–—]\\s*)?(\\[.*|Timer\\s*:.*|Requires\\s*:.*)$`, 'i');
const TIER_HEAD = new RegExp(`^(${TIERS.join('|')})\\b.*ailments?`, 'i');

/**
 * Parse pasted ailment pages. A heading like "Novice Ailments"
 * sets the tier for what follows; otherwise `defaultTier` is used.
 * Returns { ailments, warnings }.
 */
export function parseAilments(text, defaultTier = 'Novice') {
  // "JQK) Name" (face cards run together) → "J - K) Name"
  const lines = dropPageNumbers(glueBrokenLines(splitLines(text).map((l) => l.replace(/^([AJQK])[AJQK]?([AJQK])\)/i, '$1 - $2)'))));
  const ailments = [];
  let tier = defaultTier;
  let a = null;
  let inConsequence = false;

  for (const line of lines) {
    const t = line.match(TIER_HEAD);
    if (t) { tier = TIERS.find((x) => x.toLowerCase() === t[1].toLowerCase()); a = null; continue; }
    const head = line.match(AILMENT_HEAD);
    if (head) {
      const body = head[4];
      // "Timer: 6", or "Timer: 1 Season (13 Weeks)" (kept as text: no countdown).
      const timer = body.match(/Timer\s*:?\s*(\d+)(\s*Seasons?(?:\s*\([^)]*\))?)?/i);
      // Text after the timer (or after the last tag) is the start of the
      // description, when the copy ran the lines together.
      const tail = timer ? body.slice(timer.index + timer[0].length) : body.slice(body.lastIndexOf(']') + 1);
      const r1 = rankNumber(head[1]), r2 = head[2] ? rankNumber(head[2]) : r1;
      a = {
        tier, rank: Math.min(r1, r2), rankMax: Math.max(r1, r2), name: clean(head[3]),
        tags: readTags(timer ? body.slice(0, timer.index) : body),
        timer: timer && !timer[2] ? +timer[1] : null,
        timerText: timer && timer[2] ? clean(timer[0].replace(/^Timer\s*:?\s*/i, '')) : '',
        desc: clean(tail.replace(/^[\s\-–—.,:;]+/, '')), consequence: '', extra: '',
        // "Requires: Golden Bark & Borrowed Time" — specific reagents instead of tags
        needs: (body.match(/Requires\s*:\s*(.*?)(?:[-–—]\s*Timer|$)/i)?.[1] || '').split(/\s*(?:&|,|\band\b)\s*/).map(clean).filter(Boolean),
      };
      if (a.needs.length) a.desc = clean(a.desc.replace(/^Requires\s*:.*$/i, ''));
      ailments.push(a);
      inConsequence = false;
      continue;
    }
    if (!a) continue;
    const cons = line.match(/^Consequences?\s*:\s*(.*)$/i);
    if (cons) { a.consequence = cons[1]; inConsequence = 'c'; continue; }
    // "Extra: you must find the original body…" (a special rule for this ailment)
    const extra = line.match(/^Extra\s*:\s*(.*)$/i);
    if (extra) { a.extra = extra[1]; inConsequence = 'e'; continue; }
    if (inConsequence === 'e') a.extra = clean(a.extra + ' ' + line);
    else if (inConsequence) a.consequence = clean(a.consequence + ' ' + line);
    else a.desc = clean(a.desc + ' ' + line);
  }

  const warnings = [];
  const unset = ailments.filter((x) => x.tags.some((g) => g.pot == null)).length;
  if (unset) warnings.push(`${unset} ailment${unset === 1 ? ' has' : 's have'} tags with no ★ potency (the book's stars don't copy). Set them in the Library: tick "Needs ★".`);
  const noTags = ailments.filter((x) => !x.tags.length && !x.needs?.length).map((x) => x.name);
  if (noTags.length) warnings.push(`No [TAGS] found for: ${noTags.join(', ')} (some ailments have special cures: check their text and edit them)`);
  return { ailments, warnings };
}

/** Which kind of page is this? 'reagents' | 'ailments' | null */
export function detectKind(text) {
  const lines = glueBrokenLines(splitLines(text));
  const r = lines.filter((l) => REAGENT_HEAD.test(l)).length;
  const a = lines.filter((l) => AILMENT_HEAD.test(l)).length;
  if (!r && !a) return null;
  return r >= a ? 'reagents' : 'ailments';
}

// ---------------------------------------------------------------
// Back to text (for the editor): the same layout the parser reads,
// so editing an entry is just "change the text, parse it again".
// ---------------------------------------------------------------
const starText = (pot) => (pot ? '★'.repeat(pot) : '');
const PAST = { RAW: 'added RAW', DISTIL: 'DISTILLED' };
const methodText = (m) => PAST[m] || (m.endsWith('E') ? m + 'D' : m + 'ED');

export function reagentToText(r) {
  const out = [`${r.name} ${starText(r.pot, r.potGuess)} - ${r.type} - ${r.locales.length ? r.locales.map((l) => `${l.name} (${l.value})`).join(' - ') : (r.where || '???')}`];
  if (r.only?.length) out.push(`Can only be found during ${r.only.join(' and ')}`);
  const seasons = Object.entries(r.seasons || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${v} in ${k}`);
  if (seasons.length) out.push(seasons.join(' | '));
  if (r.desc) out.push(r.desc);
  if (r.requires) out.push(`Requires a ${r.requires} to collect`);
  if (r.poison) out.push(`Adds ${r.poison} point${r.poison === 1 ? '' : 's'} of POISON`);
  if (r.sweet) out.push(`Adds ${r.sweet} point${r.sweet === 1 ? '' : 's'} of SWEET`);
  for (const p of r.parts) {
    out.push(`${p.part} can be ${p.methods.map(methodText).join(' then ')} for ${p.tags.includes('ANY') ? 'a [TAG] of your choosing' : p.tags.map((t) => `[${t}]`).join(' ')}`
      + (p.causes?.length ? ` but CAUSES ${p.causes.map((t) => `[${t}]`).join(' ')}` : ''));
  }
  return out.join('\n');
}

export function ailmentToText(a) {
  const lab = (n) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[n] || String(n));
  const rank = a.rankMax && a.rankMax !== a.rank ? `${lab(a.rank)} - ${lab(a.rankMax)}` : (a.rank === 1 ? '1' : lab(a.rank));
  const timer = a.timer ? ` - Timer: ${a.timer}` : a.timerText ? ` - Timer: ${a.timerText}` : '';
  const needs = a.needs?.length ? `Requires: ${a.needs.join(' & ')}` : '';
  const out = [`${rank}) ${a.name} - ${[a.tags.map((t) => `[${t.tag} ${starText(t.pot, t.guess)}]`).join(' '), needs].filter(Boolean).join(' ')}${timer}`];
  if (a.desc) out.push(a.desc);
  if (a.extra) out.push(`Extra: ${a.extra}`);
  if (a.consequence) out.push(`Consequence: ${a.consequence}`);
  return out.join('\n');
}

/** Replace one record (editor save). Keeps its id. */
export function replaceRecord(kind, id, rec) {
  const list = state.apo[kind];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = { ...rec, id }; else list.push({ ...rec, id: id || uid() });
  save('apo'); emit();
}

// ---------------------------------------------------------------
// Saving into the library
// ---------------------------------------------------------------
/**
 * Add parsed records. A reagent with the same source + name, or an
 * ailment with the same source + tier + card, is REPLACED, so pasting
 * a page again (after fixing it) doesn't make duplicates.
 * Potency you set by hand is kept if the new paste has none.
 */
export function addReagents(list, source) {
  let n = 0;
  // The book isn't always consistent ("Mountain" / "Mountains"):
  // reuse a spelling the library already has, ignoring a final "s".
  const known = new Map();
  const key = (name) => name.toLowerCase().replace(/s$/, '');
  for (const r of [...state.apo.reagents, ...list]) for (const l of r.locales) if (!known.has(key(l.name))) known.set(key(l.name), l.name);
  for (const x of list) {
    x.locales = x.locales.map((l) => ({ ...l, name: known.get(key(l.name)) }));
    const old = state.apo.reagents.find((o) => o.source === source && o.name.toLowerCase() === x.name.toLowerCase());
    // A potency you confirmed by hand beats a guess from a new paste.
    const keepOld = old && !old.potGuess && old.pot != null && (x.potGuess || x.pot == null);
    const rec = { ...x, source, id: old?.id || uid(), pot: keepOld ? old.pot : x.pot, potGuess: keepOld ? false : !!x.potGuess };
    if (old) Object.assign(old, rec); else state.apo.reagents.push(rec);
    n++;
  }
  save('apo'); emit();
  return n;
}

export function addAilments(list, source) {
  let n = 0;
  for (const x of list) {
    const old = state.apo.ailments.find((o) => o.source === source && o.tier === x.tier && o.rank === x.rank);
    const tags = x.tags.map((t) => {
      const o = old?.tags.find((g) => g.tag === t.tag);
      const keepOld = o && !o.guess && o.pot != null && (t.guess || t.pot == null);
      return keepOld ? { ...t, pot: o.pot, guess: false } : t;
    });
    const rec = { ...x, tags, source, id: old?.id || uid() };
    if (old) Object.assign(old, rec); else state.apo.ailments.push(rec);
    n++;
  }
  save('apo'); emit();
  return n;
}

export const getReagent = (id) => state.apo.reagents.find((r) => r.id === id);
export const getAilment = (id) => state.apo.ailments.find((a) => a.id === id);

export function deleteRecord(kind, id) {
  state.apo[kind] = state.apo[kind].filter((x) => x.id !== id);
  save('apo'); emit();
}

/** Remove everything from one source (e.g. re-doing an expansion). */
export function deleteSource(source) {
  const before = state.apo.reagents.length + state.apo.ailments.length;
  state.apo.reagents = state.apo.reagents.filter((x) => x.source !== source);
  state.apo.ailments = state.apo.ailments.filter((x) => x.source !== source);
  save('apo'); emit();
  return before - state.apo.reagents.length - state.apo.ailments.length;
}

/**
 * Bring older saves up to date: v0.7.2 and earlier left "Requires a
 * Wand to collect" inside the description. Safe to run every start.
 */
export function upgradeLibrary() {
  let changed = false;
  for (const r of state.apo.reagents) {
    if (r.requires === undefined) r.requires = '';
    // v0.7.2 guessed potency from line breaks; guesses become "not set".
    if (r.potGuess) { r.pot = null; r.potGuess = false; changed = true; }
    const m = !r.requires && r.desc?.match(REQUIRES);
    if (m) { r.requires = m[1]; r.desc = clean(r.desc.replace(REQUIRES, '')); changed = true; }
  }
  for (const a of state.apo.ailments) {
    for (const t of a.tags) if (t.guess) { t.pot = null; t.guess = false; changed = true; }
  }
  if (changed) save('apo');
}

export function sources() {
  return [...new Set([...state.apo.reagents, ...state.apo.ailments].map((x) => x.source))].sort();
}

/** Every tag used anywhere, alphabetical. */
export function allTags() {
  const set = new Set();
  for (const r of state.apo.reagents) for (const p of r.parts) p.tags.forEach((t) => set.add(t));
  for (const a of state.apo.ailments) a.tags.forEach((t) => set.add(t.tag));
  return [...set].sort();
}

// ---------------------------------------------------------------
// Looking things up
// ---------------------------------------------------------------
/**
 * Foraging value of a reagent in a locale, in a season.
 * Seasonal modifiers are added (can't go below 1).
 * Returns null if the reagent doesn't grow there.
 * (Familiars, the Flower Crown etc. come in a later version.)
 */
export function forageValue(r, locale, season) {
  if (r.only?.length && !r.only.includes(season)) return null; // "Can only be found during Spring"
  const l = r.locales.find((x) => x.name.toLowerCase() === locale.toLowerCase());
  if (!l) return null;
  return Math.max(1, l.value + (r.seasons[season] || 0));
}

/** Easiest place to find a reagent this season: { name, value } */
export function bestLocale(r, season) {
  return r.locales
    .map((l) => ({ name: l.name, value: forageValue(r, l.name, season) }))
    .sort((a, b) => a.value - b.value)[0] || null;
}

/**
 * Reagents that can cure a tag at the needed potency.
 * Returns [{ reagent, parts: [part…] }], easiest to find first.
 * A reagent with unknown potency is included (marked by pot null),
 * so a missing ★ never hides a possible cure.
 */
export function curesFor(tag, minPot = 1, season = 'Spring') {
  tag = tag.toUpperCase();
  return state.apo.reagents
    .map((reagent) => ({ reagent, parts: reagent.parts.filter((p) => p.tags.includes(tag) || p.tags.includes('ANY')) }))
    .filter((x) => x.parts.length && (x.reagent.pot == null || x.reagent.pot >= minPot))
    .sort((a, b) => (bestLocale(a.reagent, season)?.value ?? 99) - (bestLocale(b.reagent, season)?.value ?? 99));
}

/** Every locale name used by the reagents (Forest, Loch, …). */
export function localeNames() {
  return [...new Set(state.apo.reagents.flatMap((r) => r.locales.map((l) => l.name)))].sort();
}
