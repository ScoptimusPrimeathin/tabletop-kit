// =============================================================
// views/apothecaria.js — the Apothecaria tab
// -------------------------------------------------------------
// Three parts (segmented control at the top):
//   Play    — this campaign's game: patient → forage → brew
//             (drawn in views/apoplay.js)
//   Library — reagents and ailments pasted from your own book:
//             check ★ potency, edit entries, cure finder
//   Home    — this campaign's familiar, apprentices, tools,
//             upgrades and special items
//   Setup   — link locale event / Witch clue / familiar tables,
//             story-unlocked locales
//
// The tab only shows when Apothecaria is switched on in
// Settings → Game modules.
// =============================================================

import { state, ui, emit, save } from '../state.js';
import { gameOn } from '../games.js';
import {
  TIERS, SEASONS, parseReagents, parseAilments, detectKind, addReagents, addAilments,
  getReagent, getAilment, deleteRecord, deleteSource, sources, allTags, curesFor, bestLocale,
  forageValue, localeNames, reagentToText, ailmentToText, replaceRecord,
} from '../apothecaria.js';
import { renderPlay, renderHome, renderSetup, playActions, onPlayChange } from './apoplay.js';
import { play, calendar, setStock } from '../apoplay.js';
import { rankLabel } from '../tables.js';
import { esc, toast, sheet, closeSheet, askConfirm } from '../ui.js';

export const title = 'Apothecaria';

/** Should the tab be shown? (Settings → Game modules) */
export const visible = () => gameOn('apothecaria');

/** ★★, or an amber ?★ when the potency hasn't been set yet. */
const stars = (n) => (n == null ? '<span class="warn-text" title="Potency not set">?★</span>' : '★'.repeat(n));
const tagNeeds = (t) => t.pot == null || t.guess;
const reaNeeds = (r) => r.pot == null || r.potGuess;
const d = () => ui.drafts; // shorthand

export function render() {
  const mode = d().apoMode || 'play';
  return `<div class="segmented">
    ${[['play', '🧪 Play'], ['home', '🏡 Home'], ['library', '📚 Library'], ['setup', '⚙︎ Setup']].map(([id, label]) =>
      `<button class="${mode === id ? 'on' : ''}" data-act="mode" data-mode="${id}">${label}</button>`).join('')}
  </div>
  ${mode === 'play' ? renderPlay() : mode === 'home' ? renderHome() : mode === 'setup' ? renderSetup() : renderLibrary()}`;
}

function renderLibrary() {
  const lib = state.apo;
  const empty = !lib.reagents.length && !lib.ailments.length;
  const tab = d().apoTab || 'ailments';
  return `
  <section class="card">
    <div class="row spread">
      <div><b>Library</b> <span class="muted small">${lib.ailments.length} ailments · ${lib.reagents.length} reagents</span></div>
      <button class="primary" data-act="import">⧉ Paste pages</button>
    </div>
    <div class="row"><button data-act="newEntry" data-kind="reagents">＋ Reagent</button><button data-act="newEntry" data-kind="ailments">＋ Ailment</button></div>
    ${empty ? `<p class="muted small">Copy a reagent page or an ailment page from your Apothecaria PDF and paste it here.
      The app reads names, types, locales, seasons, Poison/Sweet, parts and tags. Nothing from the book is built into the app.</p>` : ''}
    ${sources().length ? `<div class="chip-row">${sources().map((s) =>
      `<span class="chip fav"><button disabled>${esc(s)}</button><button class="x" data-act="deleteSource" data-source="${esc(s)}" aria-label="Delete ${esc(s)}">✕</button></span>`).join('')}</div>` : ''}
    ${needsPotency() ? `<p class="warn small">⚠︎ ${needsPotency()} item${needsPotency() === 1 ? ' has' : 's have'} no ★ potency yet (the book's stars don't copy). Tick <b>Needs ★</b> below, open each one and tap its stars.</p>` : ''}
  </section>
  ${empty ? '' : `
  <div class="segmented">
    ${[['ailments', 'Ailments'], ['reagents', 'Reagents'], ['cures', 'Cure finder']].map(([id, label]) =>
      `<button class="${tab === id ? 'on' : ''}" data-act="tab" data-tab-id="${id}">${label}</button>`).join('')}
  </div>
  ${tab === 'ailments' ? renderAilments() : tab === 'reagents' ? renderReagents() : renderCures()}`}`;
}

function needsPotency() {
  return state.apo.reagents.filter(reaNeeds).length
    + state.apo.ailments.filter((a) => a.tags.some(tagNeeds)).length;
}

/** Season picker (affects foraging values shown). */
const curSeason = () => d().apoSeason || calendar().season;

function seasonPicker() {
  const s = curSeason();
  return `<label class="inline-label">Season
    <select data-draft="apoSeason" data-rerender>${SEASONS.map((x) => `<option ${x === s ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`;
}

// ---------------------------------------------------------------
// Ailments
// ---------------------------------------------------------------
function renderAilments() {
  const only = d().apoNeedStars;
  const tiers = [...new Set([...TIERS, ...state.apo.ailments.map((a) => a.tier)])];
  return tiers.map((tier) => {
    let list = state.apo.ailments.filter((a) => a.tier === tier);
    if (only) list = list.filter((a) => a.tags.some(tagNeeds));
    if (!list.length) return '';
    list.sort((a, b) => a.rank - b.rank || a.source.localeCompare(b.source));
    return `<section class="card">
      <h3>${esc(tier)} <span class="muted small">(${list.length})</span></h3>
      ${tier === tiers.find((t) => state.apo.ailments.some((a) => a.tier === t)) ? needStarsToggle() : ''}
      ${list.map(ailmentRow).join('')}
    </section>`;
  }).join('') || `<section class="card">${needStarsToggle()}<p class="muted">Nothing to show.</p></section>`;
}

function needStarsToggle() {
  return `<label class="toggle"><input type="checkbox" data-act="needStars" ${d().apoNeedStars ? 'checked' : ''}> Needs ★ only</label>`;
}

/** "A", "1–4", "9–Q" */
const cardRange = (a) => (a.rankMax && a.rankMax !== a.rank ? `${rankLabel(a.rank)}–${rankLabel(a.rankMax)}` : rankLabel(a.rank));

function tagChip(t) {
  return `<span class="tag">${esc(t.tag)} ${stars(t.pot, t.guess)}</span>`;
}

function ailmentRow(a) {
  const open = d().apoOpen === a.id;
  return `<div class="apo-item ${open ? 'open' : ''}">
    <button class="apo-head" data-act="open" data-id="${a.id}">
      <span class="rank">${cardRange(a)}</span>
      <span class="grow"><b>${esc(a.name)}</b> ${a.tags.map(tagChip).join(' ')}${(a.needs || []).map((n) => ` <span class="tag">${esc(n)}</span>`).join('')}
        ${sources().length > 1 ? `<br><span class="muted small">${esc(a.source)}</span>` : ''}</span>
      ${a.timer ? `<span class="muted small">⏱${a.timer}</span>` : a.timerText ? `<span class="muted small">⏱${esc(a.timerText)}</span>` : ''}
    </button>
    ${open ? `<div class="apo-body">
      ${a.desc ? `<p class="small">${esc(a.desc)}</p>` : ''}
      ${a.extra ? `<p class="small notice-text"><b>Extra:</b> ${esc(a.extra)}</p>` : ''}
      ${a.consequence ? `<p class="small"><b>Consequence:</b> ${esc(a.consequence)}</p>` : ''}
      ${a.tags.map((t, i) => `<div class="row small">Potency for <b>${esc(t.tag)}</b>: ${potButtons('ail', a.id, i, t.pot, t.guess)}</div>`).join('')}
      <div class="row spread small"><span class="muted">${esc(a.source)}</span>
        <button data-act="curesOf" data-id="${a.id}">Find cures →</button>
        <button data-act="editEntry" data-kind="ailments" data-id="${a.id}">✎ Edit</button>
        <button class="danger" data-act="del" data-kind="ailments" data-id="${a.id}">Delete</button></div>
    </div>` : ''}
  </div>`;
}

/** Three tap targets: ★ ★★ ★★★ (the current one highlighted). */
function potButtons(kind, id, idx, current, guess) {
  return [1, 2, 3].map((n) =>
    `<button class="chip ${current === n ? 'primary' : ''}" data-act="setPot" data-kind="${kind}" data-id="${id}" data-idx="${idx}" data-pot="${n}">${'★'.repeat(n)}</button>`).join(' ');
}

// ---------------------------------------------------------------
// Reagents
// ---------------------------------------------------------------
function renderReagents() {
  const q = (d().apoSearch || '').trim().toLowerCase();
  const season = curSeason();
  let list = state.apo.reagents.filter((r) => !q
    || r.name.toLowerCase().includes(q)
    || r.type.toLowerCase() === q
    || r.locales.some((l) => l.name.toLowerCase().includes(q))
    || r.parts.some((p) => p.tags.some((t) => t.toLowerCase().includes(q))));
  if (d().apoNeedStars) list = list.filter(reaNeeds);
  list.sort((a, b) => a.name.localeCompare(b.name));
  return `<section class="card">
    <div class="row">
      <input type="search" placeholder="Name, tag, locale or type" data-draft="apoSearch" data-rerender value="${esc(d().apoSearch || '')}">
      ${seasonPicker()}
    </div>
    ${needStarsToggle()}
    <p class="muted small">${list.length} of ${state.apo.reagents.length}. Numbers are foraging values in ${season} (draw that card or higher to find it).</p>
    ${list.map((r) => reagentRow(r, season)).join('')}
  </section>`;
}

function reagentRow(r, season) {
  const open = d().apoOpen === r.id;
  const where = (r.locales.map((l) => `${esc(l.name)} ${forageValue(r, l.name, season) ?? '—'}`).join(' · ') || esc(r.where || '???'))
    + (r.only?.length ? ` · only in ${r.only.map(esc).join(', ')}` : '');
  return `<div class="apo-item ${open ? 'open' : ''}">
    <button class="apo-head" data-act="open" data-id="${r.id}">
      <span class="grow"><b>${esc(r.name)}</b> ${stars(r.pot, r.potGuess)} <span class="muted small">${esc(r.type)}</span>${play().stock[r.id] ? ` <span class="tag">×${play().stock[r.id]} in stock</span>` : ''}<br>
        <span class="small">${where}</span>
        ${r.poison ? ` <span class="small poison">☠${r.poison}</span>` : ''}${r.sweet ? ` <span class="small sweet">🍯${r.sweet}</span>` : ''}
        <br><span class="small muted">${[...new Set(r.parts.flatMap((p) => p.tags))].map(esc).join(', ')}</span></span>
    </button>
    ${open ? `<div class="apo-body">
      ${r.desc ? `<p class="small">${esc(r.desc)}</p>` : ''}
      ${Object.keys(r.seasons).length ? `<p class="small">Seasons: ${Object.entries(r.seasons).map(([s, v]) => `${v > 0 ? '+' : ''}${v} in ${esc(s)}`).join(' | ')}</p>` : ''}
      ${r.parts.map((p) => `<p class="small"><b>${esc(p.part)}</b>: ${p.methods.map(esc).join(' → ')} for ${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}
        ${p.causes?.length ? ` <span class="poison">but causes ${p.causes.map(esc).join(', ')}</span>` : ''}</p>`).join('')}
      ${r.requires ? `<p class="small warn">Requires ${esc(r.requires)} to collect</p>` : ''}
      <div class="row small">Potency: ${potButtons('rea', r.id, -1, r.pot, r.potGuess)}</div>
      <div class="row small">In stock (this campaign): <button class="chip" data-act="stock" data-id="${r.id}" data-d="-1">−</button>
        <b>${play().stock[r.id] || 0}</b> <button class="chip" data-act="stock" data-id="${r.id}" data-d="1">＋</button></div>
      <div class="row spread small"><span class="muted">${esc(r.source)}</span>
        <button data-act="editEntry" data-kind="reagents" data-id="${r.id}">✎ Edit</button>
        <button class="danger" data-act="del" data-kind="reagents" data-id="${r.id}">Delete</button></div>
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------
// Cure finder: pick an ailment (or tags) → reagents that cure them
// ---------------------------------------------------------------
function renderCures() {
  const season = curSeason();
  const aId = d().apoCureAilment || '';
  const a = aId ? getAilment(aId) : null;
  const picked = a ? a.tags : (d().apoCureTags || []).map((tag) => ({ tag, pot: 1 }));
  const ails = [...state.apo.ailments].sort((x, y) => TIERS.indexOf(x.tier) - TIERS.indexOf(y.tier) || x.rank - y.rank);
  return `<section class="card">
    <label>Ailment
      <select data-draft="apoCureAilment" data-rerender>
        <option value="">— pick tags instead —</option>
        ${ails.map((x) => `<option value="${x.id}" ${x.id === aId ? 'selected' : ''}>${esc(x.tier)} ${cardRange(x)} · ${esc(x.name)}${sources().length > 1 ? ` (${esc(x.source)})` : ''}</option>`).join('')}
      </select></label>
    ${a ? '' : `<div class="chip-row">${allTags().map((t) =>
      `<button class="chip ${picked.some((p) => p.tag === t) ? 'primary' : ''}" data-act="cureTag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
    ${seasonPicker()}
  </section>
  ${picked.map((t) => {
    const list = curesFor(t.tag, t.pot ?? 1, season);
    return `<section class="card">
      <h3>${esc(t.tag)} ${a ? stars(t.pot, t.guess) : ''} <span class="muted small">${list.length} reagent${list.length === 1 ? '' : 's'}</span></h3>
      ${list.length ? list.map(({ reagent: r, parts }) => {
        const best = bestLocale(r, season);
        return `<div class="small cure-row"><b>${esc(r.name)}</b> ${stars(r.pot, r.potGuess)}
          · ${best ? `${esc(best.name)} ${best.value}` : 'nowhere'}
          ${r.poison ? `<span class="poison">☠${r.poison}</span>` : ''}${r.sweet ? `<span class="sweet">🍯${r.sweet}</span>` : ''}
          <br><span class="muted">${parts.map((p) => `${esc(p.part)}: ${p.methods.map(esc).join('→')}${p.tags.length > 1 ? ` (also ${p.tags.filter((x) => x !== t.tag).map(esc).join(', ')})` : ''}${p.causes?.length ? `, causes ${p.causes.map(esc).join(', ')}` : ''}`).join(' · ')}</span></div>`;
      }).join('') : '<p class="muted small">No reagent in your library cures this at that potency.</p>'}
    </section>`;
  }).join('')}`;
}

// ---------------------------------------------------------------
// Paste sheet
// ---------------------------------------------------------------
function openImport() {
  const srcs = sources();
  const el = sheet('Paste Apothecaria pages', `
    <p class="muted small">Paste one or more <b>reagent pages</b> or <b>ailment pages</b> (one kind at a time). The app spots which kind it is.
      An ailment page's heading (e.g. "Novice Ailments") sets the tier; otherwise the tier below is used.
      Pasting the same page again replaces those entries, so you can fix and re-paste.</p>
    <label>Source <span class="muted small">(base game or expansion name)</span>
      <input type="text" id="apo-src" list="apo-srcs" value="${esc(d().apoSource || srcs[0] || 'Base game')}">
      <datalist id="apo-srcs">${srcs.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <label>Tier if the page has no heading
      <select id="apo-tier">${TIERS.map((t) => `<option ${t === (d().apoTier || 'Novice') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <textarea rows="14" id="apo-text" spellcheck="false" placeholder="Paste here"></textarea>
    <div id="apo-preview" class="small"></div>
    <button class="primary wide" data-apo="import">Add to library</button>`);
  const text = el.querySelector('#apo-text');
  const prev = el.querySelector('#apo-preview');
  const parse = () => {
    const kind = detectKind(text.value);
    if (kind === 'reagents') return { kind, ...parseReagents(text.value) };
    if (kind === 'ailments') return { kind, ...parseAilments(text.value, el.querySelector('#apo-tier').value) };
    return { kind: null, warnings: [] };
  };
  const update = () => {
    const p = parse();
    if (!p.kind) { prev.innerHTML = '<p class="muted">Nothing recognised yet. Reagent lines look like <code>Name ★ - PLANT - Forest (3)</code>; ailment lines like <code>1) Name - [TAG ★] - Timer: 6</code>.</p>'; return; }
    const items = p.kind === 'reagents'
      ? p.reagents.map((r) => `${esc(r.name)} ${r.pot ? '★'.repeat(r.pot) : '?★'} · ${esc(r.type)} · ${r.locales.map((l) => `${esc(l.name)} ${l.value}`).join(', ')} · ${r.parts.length} part${r.parts.length === 1 ? '' : 's'}`)
      : p.ailments.map((a) => `${esc(a.tier)} ${cardRange(a)} · ${esc(a.name)} · ${a.tags.map((t) => `${esc(t.tag)} ${t.pot ? '★'.repeat(t.pot) : '?★'}`).join(' ')}${a.timer ? ` · ⏱${a.timer}` : ''}`);
    prev.innerHTML = `<p><b>${items.length} ${p.kind}</b></p><ul class="apo-preview">${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      ${p.warnings.map((w) => `<p class="warn">⚠︎ ${esc(w)}</p>`).join('')}`;
  };
  text.addEventListener('input', update);
  el.querySelector('#apo-tier').addEventListener('change', update);
  update();
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-apo="import"]')) return;
    const p = parse();
    const source = el.querySelector('#apo-src').value.trim() || 'Base game';
    d().apoSource = source;
    d().apoTier = el.querySelector('#apo-tier').value;
    if (!p.kind) return toast('Nothing recognised');
    const n = p.kind === 'reagents' ? addReagents(p.reagents, source) : addAilments(p.ailments, source);
    d().apoTab = p.kind;
    closeSheet();
    toast(`Added ${n} ${p.kind}`);
    emit();
  });
}

// ---------------------------------------------------------------
// Editor: an entry is edited as text in the book's own layout, then
// parsed again, so the same rules apply as when pasting.
// ---------------------------------------------------------------
const TEMPLATES = {
  reagents: 'New Reagent ★ - PLANT - Forest (5)\n+1 in Winter\nA short description.\nAdds 1 point of POISON\nLeaves can be CRUSHED then BOILED for [MOOD] and [PAIN]',
  ailments: '1) New Ailment - [PAIN ★] [MOOD ★★] - Timer: 6\nA short description.\nConsequence: What happens if you fail.',
};

function openEditor(kind, id) {
  const rec = id ? (kind === 'reagents' ? getReagent(id) : getAilment(id)) : null;
  const text = rec ? (kind === 'reagents' ? reagentToText(rec) : ailmentToText(rec)) : TEMPLATES[kind];
  const isA = kind === 'ailments';
  const el = sheet(`${rec ? 'Edit' : 'New'} ${isA ? 'ailment' : 'reagent'}`, `
    <p class="muted small">Edit the text below; it's read the same way as a pasted page.
      ${isA ? 'First line: <code>card) Name - [TAG ★★] … - Timer: n</code> (leave out the Timer if none). Then the description and <code>Consequence: …</code>.'
        : 'First line: <code>Name ★★ - TYPE - Locale (value) - Locale (value)</code>. Then optional lines: <code>+1 in Autumn | -2 in Summer</code>, a description, <code>Requires a Wand to collect</code>, <code>Adds 2 points of POISON</code> (or SWEET), and one line per part: <code>Part can be CRUSHED then BOILED for [TAG] [TAG] but CAUSES [TAG]</code> (methods: CRUSHED, BOILED, DISTILLED, added RAW).'}
      Type ★ for potency (or leave it out and set it later).</p>
    <label>Source <input type="text" id="ed-src" value="${esc(rec?.source || d().apoSource || 'Base game')}"></label>
    ${isA ? `<label>Tier <select id="ed-tier">${TIERS.map((t) => `<option ${t === (rec?.tier || 'Novice') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    <textarea rows="12" id="ed-text" spellcheck="false">${esc(text)}</textarea>
    <div id="ed-preview" class="small"></div>
    <div class="row spread"><button class="primary" data-ed="save">Save</button><button data-close>Cancel</button></div>`);
  const ta = el.querySelector('#ed-text'), prev = el.querySelector('#ed-preview');
  const parse = () => {
    const res = isA ? parseAilments(ta.value, el.querySelector('#ed-tier').value) : parseReagents(ta.value);
    const list = isA ? res.ailments : res.reagents;
    return { rec: list[0], extra: list.length - 1, warnings: res.warnings };
  };
  const update = () => {
    const { rec: r, extra } = parse();
    if (!r) { prev.innerHTML = '<p class="warn">⚠︎ The first line isn\'t readable yet.</p>'; return; }
    prev.innerHTML = isA
      ? `<p>✓ ${cardRange(r)} · <b>${esc(r.name)}</b> · ${r.tags.map((t) => `${esc(t.tag)} ${t.pot ? '★'.repeat(t.pot) : '?★'}`).join(', ')}${r.timer ? ` · ⏱${r.timer}` : ' · no timer'}${r.consequence ? ' · has consequence' : ''}</p>`
      : `<p>✓ <b>${esc(r.name)}</b> ${r.pot ? '★'.repeat(r.pot) : '?★'} · ${esc(r.type)} · ${r.locales.map((l) => `${esc(l.name)} ${l.value}`).join(', ')}
         ${Object.keys(r.seasons).length ? ` · seasons ${Object.entries(r.seasons).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}` : ''}
         ${r.poison ? ` · ☠${r.poison}` : ''}${r.sweet ? ` · 🍯${r.sweet}` : ''}${r.requires ? ` · requires ${esc(r.requires)}` : ''}</p>
         <ul class="apo-preview">${r.parts.map((p) => `<li>${esc(p.part)}: ${p.methods.join('→')} for ${p.tags.join(', ')}${p.causes.length ? `; causes ${p.causes.join(', ')}` : ''}</li>`).join('')}</ul>`;
    if (extra > 0) prev.innerHTML += `<p class="warn">⚠︎ That reads as ${extra + 1} entries; only the first is saved.</p>`;
  };
  ta.addEventListener('input', update);
  el.querySelector('#ed-tier')?.addEventListener('change', update);
  update();
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ed="save"]')) return;
    const { rec: r } = parse();
    if (!r) return toast("The first line isn't readable");
    r.source = el.querySelector('#ed-src').value.trim() || 'Base game';
    replaceRecord(kind, rec?.id || null, r);
    closeSheet();
    toast('Saved');
  });
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------
export const actions = {
  ...playActions,
  mode: (el) => { d().apoMode = el.dataset.mode; emit(); },
  newEntry: (el) => openEditor(el.dataset.kind, null),
  editEntry: (el) => openEditor(el.dataset.kind, el.dataset.id),
  stock: (el) => setStock(el.dataset.id, (play().stock[el.dataset.id] || 0) + +el.dataset.d),
  import: () => openImport(),
  tab: (el) => { d().apoTab = el.dataset.tabId; d().apoOpen = null; emit(); },
  open: (el) => { d().apoOpen = d().apoOpen === el.dataset.id ? null : el.dataset.id; emit(); },
  needStars: (el) => { d().apoNeedStars = el.checked; emit(); },
  setPot: (el) => {
    const pot = +el.dataset.pot;
    // Tapping a star value confirms it (clears the "guess" mark).
    if (el.dataset.kind === 'rea') Object.assign(getReagent(el.dataset.id), { pot, potGuess: false });
    else Object.assign(getAilment(el.dataset.id).tags[+el.dataset.idx], { pot, guess: false });
    save('apo');
    emit();
  },
  curesOf: (el) => { d().apoTab = 'cures'; d().apoCureAilment = el.dataset.id; emit(); },
  cureTag: (el) => {
    const set = new Set(d().apoCureTags || []);
    const t = el.dataset.tag;
    if (set.has(t)) set.delete(t); else set.add(t);
    d().apoCureTags = [...set];
    emit();
  },
  del: async (el) => {
    const kind = el.dataset.kind;
    const rec = kind === 'reagents' ? getReagent(el.dataset.id) : getAilment(el.dataset.id);
    if (!(await askConfirm(`Delete ${rec.name}?`, 'Delete'))) return;
    deleteRecord(kind, rec.id);
  },
  deleteSource: async (el) => {
    const s = el.dataset.source;
    if (!(await askConfirm(`Delete everything from "${s}"? You can paste it again later.`, 'Delete'))) return;
    toast(`Deleted ${deleteSource(s)} items`);
  },
};

/** Change events from this tab's fields (see onPlayChange). */
export function onChange(el) {
  if (el.dataset.change) onPlayChange(el);
}

export { localeNames };
