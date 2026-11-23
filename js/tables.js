// =============================================================
// tables.js — random tables: parsing, rolling, packs
// -------------------------------------------------------------
// A table looks like:
//   {
//     id, name, folder,          // folder = which "pack" it belongs to
//     columns: [{ name, entries }],   // optional: a GRID table (one roll,
//                                     // several columns, e.g. fishing by
//                                     // locale). `entries` = first column.
//     die: 'auto' | 'd6' | 'd100' | 'card' | …,
//                                // 'card' = keyed by a playing card
//                                // (A=1 … 10, J=11, Q=12, K=13, Joker=14)
//                                // and "rolled" by drawing from the deck
//     entries: [ { min, max, text } ],
//     notes: ''                  // optional description
//   }
//
// Entry text can contain:
//   [[Other Table]]    → roll that table and insert its result
//   [[Folder/Table]]   → same, when two folders share a name
//   {2d6}              → roll dice inline, e.g. "{1d6} goblins"
//
// So a "generator" is just a table with one entry like
//   "[[Name]], a [[Occupation]] who wants [[Goal]]"
// =============================================================

import { state, save, emit } from './state.js';
import { rollDie, uid } from './rng.js';
import { roll as rollDice } from './dice.js';
import { draw as drawCards, playingCard } from './decks.js';

// ---------------------------------------------------------------
// PARSING pasted text  →  entries
// ---------------------------------------------------------------
// Accepts the formats books use:
//   1-5 Text      01–05: Text     6. Text     96-00 Text   (00 = 100)
// Lines that don't start with a number are glued onto the previous
// entry (PDF copy/paste often wraps long entries over two lines).
// If *no* lines are numbered, each line becomes its own entry and
// the table rolls a die with that many sides.

// Number, optional "-"/"–"/"—"/"to" + second number, optional
// punctuation, then the text.
// (After ":" "." ")" or "]" the space is optional, so "100:Wild" works.)
const NUMBERED = /^\s*(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?\s*(?:[.:)\]]\s*|\s+)(\S.*)$/;

function toNumber(s) {
  // Books write the top of a d100 as "00" and the top of a d10 as "0".
  if (s === '00') return 100;
  if (s === '0') return 10;
  return parseInt(s, 10);
}

// Several "N: word" items on one line (books often print tables in
// columns, and copying from a PDF can keep the columns on one line).
// Only splits when the numbers are followed by ":" "." or ")", so a
// sentence like "3 goblins and 4 wolves" is left alone.
const MULTI_ITEM = /(?:^|\s)(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)\s*[:.)]\s*(?=\D)/g;

function splitMultiItemLine(line) {
  const marks = [...line.matchAll(MULTI_ITEM)];
  if (marks.length < 2) return [line];
  const out = [];
  marks.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : line.length;
    const text = line.slice(start, end).trim();
    if (text) out.push(`${m[1]} ${text}`);
  });
  return out;
}

// A line that is ONLY a number or range, like "56-65" or "07".
const BARE_RANGE = /^\s*(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?\s*[.:)\]]?\s*$/;

/**
 * Grid copies from PDFs often put the range on one line and its text
 * on the next ("56-65" / "NPC Positive"). Glue those pairs together.
 */
function joinBareRanges(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (BARE_RANGE.test(lines[i]) && next && !BARE_RANGE.test(next) && !NUMBERED.test(next)) {
      out.push(`${lines[i].replace(/[.:)\]]\s*$/, '')} ${next}`);
      i++;
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

// A lone number above 100 is almost always a page number from the PDF.
const isPageNumber = (l) => /^\d{3,4}$/.test(l.trim()) && +l > 100;

export function parseEntries(text) {
  const lines = joinBareRanges(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !isPageNumber(l)))
    .flatMap(splitMultiItemLine);
  if (!lines.length) return [];
  const numberedCount = lines.filter((l) => NUMBERED.test(l)).length;

  // Mostly un-numbered → simple list, one entry per line.
  if (numberedCount < Math.ceil(lines.length * 0.5)) {
    return lines.map((t, i) => ({ min: i + 1, max: i + 1, text: t }));
  }

  const entries = [];
  for (const line of lines) {
    const m = line.match(NUMBERED);
    if (m) {
      let min = toNumber(m[1]);
      let max = m[2] ? toNumber(m[2]) : min;
      if (max < min) [min, max] = [max, min];
      entries.push({ min, max, text: m[3].trim() });
    } else if (entries.length) {
      entries[entries.length - 1].text += ' ' + line; // continuation
    }
  }
  // Column layouts paste out of order (1, 51, 2, 52…); sort by number.
  return entries.sort((a, b) => a.min - b.min);
}

// ---------------------------------------------------------------
// CARD-KEYED tables (Apothecaria and other card-driven games)
// ---------------------------------------------------------------
// Entries are labelled with a card rank instead of a number:
//   A  You find…      2  A rumour…      J/Q/K  Mount a rescue…
// We store them as numbers so the rest of the code doesn't care:
//   A=1, 2–10 as-is, J=11, Q=12, K=13, Joker=14.

const RANKS = { a: 1, ace: 1, j: 11, jack: 11, q: 12, queen: 12, k: 13, king: 13, joker: 14 };
const RANK_WORD = '(Ace|Jack|Queen|King|Joker|10|[2-9]|[AJQK])';
// label, optional second label for a range ("J-K", "Queen/King",
// "J, Q, K"), then: punctuation, 2+ spaces, a tab, or end of line.
// A single space also counts, EXCEPT after "A" (so the sentence
// "A curse from a goblin…" isn't read as the Ace entry) unless the
// next word starts with a capital letter ("A You find…").
const CARD_LABEL = new RegExp(
  `^${RANK_WORD}(?:\\s*(?:[-–—/&,]|to)\\s*${RANK_WORD})*(?:\\s*(?:[-–—/&,]|to)\\s*${RANK_WORD})?` +
  `(?:\\s*[.:)\\]]\\s*|\\s{2,}|\\t|\\s(?=\\S)|\\s*$)(.*)$`, 'i');

/** Turn "J", "10", "Queen" … into a number. */
export function rankNumber(word) {
  const w = String(word).toLowerCase();
  return RANKS[w] ?? parseInt(w, 10);
}

/** 1 → "A", 11 → "J", 14 → "Joker". */
export function rankLabel(n) {
  return { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'Joker' }[n] || String(n);
}

// Suit labels: "7♥", "1♦", "K♣", or a suit on its own ("♥", "♣♠") for
// tables keyed by suit only (e.g. familiar forms by suit).
const SUITS = { '♥': 'H', '♦': 'D', '♣': 'C', '♠': 'S', '♡': 'H', '♢': 'D', '♧': 'C', '♤': 'S' };
const SUIT_LABEL = /^(Ace|Jack|Queen|King|10|[1-9]|[AJQK])?\s*([♥♦♣♠♡♢♧♤]+)\s*(?:[-–—:.)]\s*|\s+|$)(.*)$/i;

/** Read the label at the start of a line. Returns { min, max, suits?, text } or null. */
function cardLabel(line, allowSuitOnly = true) {
  const sm = line.match(SUIT_LABEL);
  if (sm && (sm[1] || allowSuitOnly)) {
    const suits = [...sm[2]].map((c) => SUITS[c]).join('');
    const n = sm[1] ? (sm[1] === '1' ? 1 : rankNumber(sm[1])) : null;
    return { min: n ?? 1, max: n ?? 13, suits, text: sm[3].trim() };
  }
  const m = line.match(CARD_LABEL);
  if (!m) return null;
  // Every rank word in the label part (before the text).
  const labelPart = line.slice(0, line.length - m[m.length - 1].length);
  const nums = [...labelPart.matchAll(new RegExp(RANK_WORD, 'gi'))].map((x) => rankNumber(x[1]));
  const text = m[m.length - 1].trim().replace(/^[-–—:.)\]]\s*/, '');
  // The "A + lowercase word" guard described above.
  if (/^A\s+[a-z]/.test(line) && nums.length === 1) return null;
  if (!nums.length || nums.some((n) => !(n >= 1 && n <= 14))) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), text };
}

/** Does this pasted text look like a card-keyed table? */
export function looksLikeCards(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const faces = lines.filter((l) => { const c = cardLabel(l); return c && c.max >= 11; }).length;
  return faces >= 2;
}

/**
 * Parse a card-keyed table. Copying from a PDF can put the label
 * in the MIDDLE of its entry (the book centres it vertically), so
 * when entries are separated by blank lines, any text in the same
 * block before the label belongs to that label.
 * Labels on their own line ("J" / "Q" / "K" stacked) merge into one
 * range with the text that follows.
 */
export function parseCardEntries(text) {
  const rawLines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => !isPageNumber(l));
  const hasBlocks = rawLines.some((l) => !l);
  // Blocks = runs of non-blank lines. No blank lines → each line is its own block.
  const blocks = [];
  let cur = [];
  for (const l of rawLines) {
    if (!l) { if (cur.length) blocks.push(cur); cur = []; continue; }
    if (!hasBlocks) { blocks.push([l]); continue; }
    cur.push(l);
  }
  if (cur.length) blocks.push(cur);

  // A suit on its own ("♥ - …") is only a label when the table has no
  // rank labels; otherwise it's a sub-choice inside an entry's text.
  const allowSuitOnly = !rawLines.some((l) => { const c = l && cardLabel(l, false); return c && !c.suits; });
  const label = (l) => cardLabel(l, allowSuitOnly);
  const entries = [];
  let pendingLabel = null;   // bare labels waiting for their text
  let orphan = [];           // text before the very first label
  const last = () => entries[entries.length - 1];
  const start = (min, max, txt, suits) => {
    if (pendingLabel) {
      min = Math.min(min, pendingLabel.min); max = Math.max(max, pendingLabel.max);
      suits = suits || pendingLabel.suits; pendingLabel = null;
    }
    entries.push(suits ? { min, max, suits, text: txt } : { min, max, text: txt });
  };

  for (const block of blocks) {
    const labelled = block.map((l) => label(l));
    const firstIdx = labelled.findIndex(Boolean);
    if (firstIdx === -1) {
      // No label: belongs to waiting bare labels, else the previous entry.
      const txt = block.join(' ');
      if (pendingLabel) start(pendingLabel.min, pendingLabel.max, txt, pendingLabel.suits);
      else if (last() && !hasBlocks) last().text += ' ' + txt;
      else if (last()) last().text += ' ' + txt;
      else orphan.push(txt);
      continue;
    }
    // Lines before the first label: in block mode they're part of it.
    let lead = block.slice(0, firstIdx).join(' ');
    for (let i = firstIdx; i < block.length; i++) {
      const lab = labelled[i];
      if (!lab) { last().text += ' ' + block[i]; continue; }
      if (!lab.text && i === block.length - 1 && !lead) {
        // A bare label ("K") with nothing after it in this block.
        if (pendingLabel) pendingLabel = { min: Math.min(pendingLabel.min, lab.min), max: Math.max(pendingLabel.max, lab.max), suits: pendingLabel.suits || lab.suits };
        else pendingLabel = { min: lab.min, max: lab.max, suits: lab.suits };
        continue;
      }
      const txt = [lead, lab.text].filter(Boolean).join(' ');
      lead = '';
      start(lab.min, lab.max, txt, lab.suits);
    }
  }
  // Bare labels left over at the end ("K" under a "J/Q" entry) widen the last entry.
  if (pendingLabel && last()) {
    last().min = Math.min(last().min, pendingLabel.min);
    last().max = Math.max(last().max, pendingLabel.max);
  }
  if (orphan.length && entries.length) entries[0].text = orphan.join(' ') + ' ' + entries[0].text;
  for (const e of entries) e.text = e.text.replace(/\s+/g, ' ').trim();
  return entries.sort((a, b) => a.min - b.min);
}

/** Entries of a card table → editable text ("A …", "J-K …"). */
export function cardEntriesToText(entries) {
  const SYM = { H: '♥', D: '♦', C: '♣', S: '♠' };
  return entries.map((e) => {
    const suits = (e.suits || '').split('').map((c) => SYM[c]).join('');
    const rank = e.suits && e.min === 1 && e.max === 13 ? '' : e.min === e.max ? rankLabel(e.min) : `${rankLabel(e.min)}-${rankLabel(e.max)}`;
    return `${rank}${suits}${rank || suits ? ' ' : ''}${e.text}`;
  }).join('\n');
}

/** Parse in the right mode for this table's die. */
// ---------------------------------------------------------------
// GRID tables: one roll, read in the column you choose.
// Written as sections:   ## Shallows / 1 No Catch / 2 Crab …
//                        ## Ocean    / 1-2 No Catch / …
// ---------------------------------------------------------------
const COLUMN = /^\s*##\s*(.+?)\s*$/;

/** Text with "## Column" sections → [{ name, entries }], or null if none. */
export function parseColumns(die, text) {
  const lines = String(text).split(/\r?\n/);
  if (!lines.some((l) => COLUMN.test(l))) return null;
  const cols = [];
  let cur = null;
  for (const l of lines) {
    const m = l.match(COLUMN);
    if (m) { cur = { name: m[1], lines: [] }; cols.push(cur); } else if (cur) cur.lines.push(l);
  }
  return cols.map((c) => ({ name: c.name, entries: parseFor(die, c.lines.join('\n')) }));
}

/** Set a table's entries (and columns, for a grid) from editor text. */
export function applyText(table, text) {
  const cols = parseColumns(table.die, text);
  if (cols) { table.columns = cols; table.entries = cols[0]?.entries || []; }
  else { delete table.columns; table.entries = parseFor(table.die, text); }
  return table;
}

/** One column of a grid table, as an ordinary table you can roll. */
export function columnTable(table, name) {
  const col = table.columns?.find((c) => c.name === name) || table.columns?.[0];
  if (!col) return table;
  const { columns, ...rest } = table;
  return { ...rest, name: `${table.name} › ${col.name}`, entries: col.entries };
}

export function parseFor(die, text) {
  return die === 'card' ? parseCardEntries(text) : parseEntries(text);
}
export function textFor(table) {
  if (table.columns) return table.columns.map((c) => `## ${c.name}\n${textFor({ die: table.die, entries: c.entries })}`).join('\n\n');
  return table.die === 'card' ? cardEntriesToText(table.entries) : entriesToText(table.entries);
}

/**
 * Bulk paste: many tables at once. A table starts with a heading:
 *   • "# Table name"  (always works), or
 *   • an ALL-CAPS line like "ADVENTURE TONE" (how book headings copy).
 * Several headings in a row with nothing between them mean the tables
 * were printed SIDE BY SIDE; "# A | B | C" means the same thing.
 * Card-keyed tables (A, 2…10, J, Q, K labels) are spotted automatically.
 * Returns [{ name, die, entries }].
 */
export function parseBulk(text) {
  const groups = [];
  let current = null;
  let prevLine = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // Blank lines are kept: card tables use them to tell entries apart.
    if (!line) { if (current?.lines.length) current.lines.push(''); continue; }
    // "## Column" inside a table = a grid column, not a new table.
    const names = current && COLUMN.test(line) ? null : headingNames(line, prevLine);
    if (names) {
      // Consecutive headings (no entries yet) join the same group.
      if (current && !current.lines.length) current.names.push(...names);
      else { current = { names, lines: [] }; groups.push(current); }
    } else if (current) {
      current.lines.push(line);
    }
    prevLine = line;
  }
  return groups
    .flatMap((g) => (g.names.length > 1 ? splitColumns(g.names, g.lines.filter(Boolean)) : [{ name: g.names[0], lines: g.lines }]))
    .map((t) => {
      const body = t.lines.join('\n');
      const die = looksLikeCards(body.replace(/^\s*##.*$/gm, '')) ? 'card' : 'auto';
      return applyText({ name: t.name, die }, body);
    })
    .filter((t) => t.entries.length);
}

/** If this line is a heading, return the table name(s); else null. */
function headingNames(line, prevLine) {
  const h = line.match(/^#+\s*(.+)$/);
  if (h) return h[1].split('|').map((n) => n.trim()).filter(Boolean);
  // ALL-CAPS line: at least 3 letters, no lowercase, no digits. Not
  // treated as a heading right after a bare range like "56-65"
  // (that's an entry's text printed in capitals).
  const caps = /^[^a-z\d]*$/.test(line) && (line.match(/[A-Z]/g) || []).length >= 3;
  if (caps && !BARE_RANGE.test(prevLine)) return [titleCase(line)];
  return null;
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

/**
 * Side-by-side tables. Every numbered item is read in order (books
 * copy row by row: A's 1, A's 51, B's 1, B's 51, C's 1, …). Each item
 * goes to the LEFT-MOST table that doesn't have that number yet, so a
 * missing or garbled item only affects itself, not the tables beside it.
 *
 * Some PDFs drop the numbers from one column, so its words arrive as a
 * run of plain lines. A run of 3+ number-less lines fills the gaps of
 * the table missing that many entries, in order. Single number-less
 * lines are treated as wrapped text of the item before them.
 */
function splitColumns(names, lines) {
  lines = joinBareRanges(lines.filter((l) => !isPageNumber(l)));
  // How many tables are really side by side? Count how often the very
  // first number repeats before the numbering moves past it.
  const nums = lines.flatMap((l) => splitMultiItemLine(l))
    .map((it) => it.match(NUMBERED)).filter(Boolean).map((mm) => toNumber(mm[1]));
  if (nums.length) {
    let count = 0, firstRowMax = -1;
    for (const n of nums) {
      if (n === nums[0]) count++;
      else if (count && n > nums[0] && n < firstRowMax) break; // second row started
      firstRowMax = Math.max(firstRowMax, n);
    }
    // Extra caps lines on top (like a page title) → keep only the last `count` names.
    if (count >= 1 && names.length > count) names = names.slice(names.length - count);
    while (names.length < count) names = [...names, `Table ${names.length + 1}`];
    if (names.length === 1) return [{ name: names[0], lines }];
  }

  // Each table: Map of first number → "min-max text" line.
  const tables = names.map((name) => ({ name, items: new Map() }));
  const orphans = []; // runs of number-less lines: { lines: [], after: { t, n } }
  let last = null;     // the item most recently placed
  let run = null;
  for (const line of lines) {
    const parts = splitMultiItemLine(line).map((it) => it.match(NUMBERED)).filter(Boolean);
    if (!parts.length) {
      if (BARE_RANGE.test(line)) continue; // a lonely number with no text
      if (!run) { run = { lines: [], after: last }; orphans.push(run); }
      run.lines.push(line);
      continue;
    }
    run = null;
    for (const mm of parts) {
      const n = toNumber(mm[1]);
      const t = tables.find((x) => !x.items.has(n)) || tables[tables.length - 1];
      t.items.set(n, `${mm[1]}${mm[2] ? '-' + mm[2] : ''} ${mm[3].trim()}`);
      last = { t, n };
    }
  }

  for (const o of orphans) {
    if (o.lines.length < 3) {
      // Wrapped text: glue onto the item before it.
      if (o.after) o.after.t.items.set(o.after.n, o.after.t.items.get(o.after.n) + ' ' + o.lines.join(' '));
      continue;
    }
    // A lost column: give it to the table with that many missing numbers.
    const gapsOf = (t) => {
      const max = Math.max(...t.items.keys(), 0);
      const size = max <= 10 ? 10 : max <= 20 ? 20 : 100;
      const g = [];
      for (let n = 1; n <= size; n++) if (!t.items.has(n)) g.push(n);
      return g;
    };
    const ranked = tables.map((t) => ({ t, g: gapsOf(t) })).filter((x) => x.g.length)
      .sort((a, b) => Math.abs(a.g.length - o.lines.length) - Math.abs(b.g.length - o.lines.length));
    if (!ranked.length) continue;
    const { t, g } = ranked[0];
    o.lines.forEach((text, i) => { if (g[i] != null) t.items.set(g[i], `${g[i]} ${text}`); });
  }

  return tables.map((t) => ({
    name: t.name,
    lines: [...t.items.keys()].sort((a, b) => a - b).map((k) => t.items.get(k)),
  }));
}

/** Entries → editable text (the reverse of parseEntries). */
export function entriesToText(entries) {
  return entries.map((e) =>
    (e.min === e.max ? `${e.min}` : `${e.min}-${e.max}`) + ' ' + e.text).join('\n');
}

/** How many sides the table's die has. */
export function dieSize(table) {
  if (table.columns) return Math.max(...table.columns.map((c) => dieSize({ die: table.die, entries: c.entries })));
  if (table.die === 'card') return table.entries.some((e) => e.max >= 14) ? 14 : 13;
  if (table.die && table.die !== 'auto') {
    const n = parseInt(table.die.replace(/^d/i, ''), 10);
    if (n > 0) return n;
  }
  return table.entries.reduce((m, e) => Math.max(m, e.max), 0) || 1;
}

/** Problems worth warning about in the editor (gaps/overlaps). */
export function checkTable(table) {
  // Grid columns are often uneven on purpose (fishing in deeper water
  // goes higher), so only overlaps inside a column are worth a warning.
  if (table.columns) {
    const overlaps = table.columns.flatMap((c) => checkTable({ die: table.die, entries: c.entries }).overlaps);
    return { size: dieSize(table), gaps: [], overlaps: [...new Set(overlaps)], tooBig: 0 };
  }
  if (table.die === 'card' && table.entries.some((e) => e.suits)) {
    // Suit-keyed: count per suit (an entry without a suit covers all four).
    // (A suitless entry is the fallback for its ranks, so it's counted on its own.)
    const hits = { H: Array(14).fill(0), D: Array(14).fill(0), C: Array(14).fill(0), S: Array(14).fill(0), any: Array(14).fill(0) };
    for (const e of table.entries) for (const s of (e.suits || ['any'])) for (let n = e.min; n <= Math.min(e.max, 13); n++) hits[s][n]++;
    const gaps = [], overlaps = [];
    for (let n = 1; n <= 13; n++) {
      if (Object.values(hits).every((h) => !h[n])) gaps.push(n);
      if (Object.values(hits).some((h) => h[n] > 1)) overlaps.push(n);
    }
    return { size: 13, gaps, overlaps, tooBig: 0 };
  }
  const size = table.die === 'card' ? 13 : dieSize(table);
  const hits = new Array(size + 1).fill(0);
  for (const e of table.entries) {
    for (let n = e.min; n <= Math.min(e.max, size); n++) hits[n]++;
  }
  const gaps = [], overlaps = [];
  for (let n = 1; n <= size; n++) {
    if (hits[n] === 0) gaps.push(n);
    if (hits[n] > 1) overlaps.push(n);
  }
  const tooBig = table.entries.filter((e) => e.max > size).length;
  return { size, gaps, overlaps, tooBig };
}

// ---------------------------------------------------------------
// FINDING tables by name (for [[links]])
// ---------------------------------------------------------------
export function findTable(ref, fromFolder) {
  const want = ref.trim().toLowerCase();
  // Prefer the current campaign's own tables over global ones.
  const all = visibleTables().sort((a, b) => (b.campaign ? 1 : 0) - (a.campaign ? 1 : 0));
  if (want.includes('/')) {
    // Split at the LAST slash: "Mythic/Elements/Smells" → folder "mythic/elements", name "smells".
    const cut = want.lastIndexOf('/');
    const folder = want.slice(0, cut).trim(), name = want.slice(cut + 1).trim();
    return all.find((t) => t.folder.toLowerCase() === folder && t.name.toLowerCase() === name)
        // also allow just the last part(s) of the folder path, e.g. [[Elements/Smells]]
        || all.find((t) => t.folder.toLowerCase().endsWith('/' + folder) && t.name.toLowerCase() === name);
  }
  // Prefer a table in the same folder, then any folder.
  return all.find((t) => t.name.toLowerCase() === want && t.folder === fromFolder)
      || all.find((t) => t.name.toLowerCase() === want);
}

/**
 * Tables you can see right now: global ones plus the current
 * campaign's own. A table with `campaign: id` belongs to one campaign.
 */
export function visibleTables() {
  const active = state.campaigns.active;
  return state.tables.filter((t) => !t.campaign || t.campaign === active);
}

export function getTable(id) {
  return state.tables.find((t) => t.id === id);
}

// ---------------------------------------------------------------
// ROLLING
// ---------------------------------------------------------------
const MAX_DEPTH = 8; // stops "Table A rolls Table A" from looping forever

/**
 * Roll a table. Returns
 *   { table, roll, entry, text, steps }
 * `text` has every [[link]] and {dice} filled in.
 * `steps` lists the nested rolls, for showing your work.
 * `forced` lets the caller pick the number instead of rolling.
 */
export function rollTable(table, depth = 0, steps = [], forced, forcedSuit) {
  const size = dieSize(table);
  let r = forced, card = null;
  if (r == null && table.die === 'card') {
    // "Roll" by drawing from the playing-card deck (shared with the
    // Cards screen, so drawn cards stay out until you reshuffle).
    const d = drawCards('standard', 1).cards[0];
    card = d ? playingCard(d.id) : null;
    r = card ? (card.joker ? 14 : card.rank) : 0;
  } else if (r == null) {
    r = rollDie(size);
  }
  // Card tables can key entries by suit too ("7♥"): prefer an entry for
  // this suit, then one without a suit.
  const suit = card && !card.joker ? card.id[0] : forcedSuit;
  const fits = (e) => r >= e.min && r <= e.max;
  const entry = (suit && table.entries.find((e) => fits(e) && e.suits?.includes(suit)))
    || table.entries.find((e) => fits(e) && !e.suits)
    || (!suit && table.entries.find(fits));
  let text = entry ? entry.text
    : r === 14 ? 'Joker (this table has no Joker entry)' : `(no entry for ${table.die === 'card' ? rankLabel(r) : r})`;
  // What to show as "the roll": the card (Q♥) or the number.
  const shown = card ? card.short : table.die === 'card' ? rankLabel(r) : r;
  if (depth > 0) steps.push(`${table.name}: ${shown}`);
  text = expand(text, table.folder, depth, steps);
  return { table, roll: r, shown, card, size, entry, text, steps };
}

/** Fill in [[links]] and {dice} inside a piece of text. */
export function expand(text, folder, depth = 0, steps = []) {
  if (depth >= MAX_DEPTH) return text;
  // Inline dice: {2d6+1}
  text = text.replace(/\{([^{}]+)\}/g, (whole, expr) => {
    try { return String(rollDice(expr).total); } catch { return whole; }
  });
  // Nested tables: [[Name]]
  text = text.replace(/\[\[([^\]]+)\]\]/g, (whole, ref) => {
    const t = findTable(ref, folder);
    if (!t) return `[missing table: ${ref}]`;
    return rollTable(t, depth + 1, steps).text;
  });
  return text;
}

// ---------------------------------------------------------------
// EDITING
// ---------------------------------------------------------------
export function saveTable(t) {
  const i = state.tables.findIndex((x) => x.id === t.id);
  if (i >= 0) state.tables[i] = t; else state.tables.push(t);
  save('tables');
  emit();
}

export function deleteTable(id) {
  state.tables = state.tables.filter((t) => t.id !== id);
  save('tables');
  emit();
}

export function newTable(folder = 'My Tables') {
  return { id: uid(), name: 'New table', folder, die: 'auto', entries: [], notes: '', campaign: null };
}

export function folders() {
  return [...new Set(visibleTables().map((t) => t.folder))].sort((a, b) => a.localeCompare(b));
}

/** Every folder path including parents of sub-folders, sorted as a tree. */
export function folderPaths() {
  const set = new Set();
  for (const f of folders()) {
    const parts = f.split('/');
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Is table folder `f` the folder `path` or inside it? */
export const inFolder = (f, path) => f === path || f.startsWith(path + '/');

/** Rename/move a folder and everything under it. Returns tables moved. */
export function renameFolder(from, to) {
  to = to.split('/').map((p) => p.trim()).filter(Boolean).join('/');
  let n = 0;
  for (const t of visibleTables()) {
    if (inFolder(t.folder, from)) { t.folder = to + t.folder.slice(from.length); n++; }
  }
  save('tables');
  emit();
  return n;
}

// ---------------------------------------------------------------
// PACKS (a folder of tables saved as one .json file)
// ---------------------------------------------------------------
export function exportPack(folder) {
  return {
    format: 'tabletop-kit-pack',
    version: 1,
    name: folder,
    tables: visibleTables().filter((t) => inFolder(t.folder, folder))
      .map(({ id, campaign, ...rest }) => rest), // ids are re-made on import
  };
}

/**
 * Import a pack. Tables with the same folder + name are replaced
 * (so re-importing an updated pack doesn't make duplicates).
 * Returns how many tables were added/updated.
 */
export function importPack(pack, campaign = null) {
  if (!pack || pack.format !== 'tabletop-kit-pack' || !Array.isArray(pack.tables)) {
    throw new Error("That file isn't a Tabletop Kit table pack.");
  }
  let n = 0;
  for (const t of pack.tables) {
    if (!t.name || !Array.isArray(t.entries)) continue;
    const folder = t.folder || pack.name || 'Imported';
    const existing = state.tables.find((x) => x.folder === folder && x.name === t.name && (x.campaign || null) === campaign);
    const table = {
      id: existing ? existing.id : uid(),
      name: t.name, folder, die: t.die || 'auto', notes: t.notes || '', campaign,
      entries: t.entries.map((e) => ({ min: +e.min, max: +e.max, text: String(e.text), ...(e.suits ? { suits: e.suits } : {}) })),
      ...(Array.isArray(t.columns) ? { columns: t.columns.map((c) => ({ name: String(c.name), entries: c.entries.map((e) => ({ min: +e.min, max: +e.max, text: String(e.text) })) })) } : {}),
    };
    if (existing) Object.assign(existing, table); else state.tables.push(table);
    n++;
  }
  save('tables');
  emit();
  return n;
}
