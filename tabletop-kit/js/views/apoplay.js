// =============================================================
// views/apoplay.js — Apothecaria Play, Home and Setup screens
// -------------------------------------------------------------
// Drawn inside the Apothecaria tab (views/apothecaria.js merges
// these actions into its own). The game rules live in apoplay.js;
// this file only draws them and reacts to taps.
//
// Selects/text boxes use data-change="handler" and are handled by
// onPlayChange() (called from the tab's onChange hook).
// =============================================================

import { state, ui, emit, save } from '../state.js';
import { esc, toast } from '../ui.js';
import { getReagent, curesFor, localeNames, TIERS } from '../apothecaria.js';
import { visibleTables, rankLabel } from '../tables.js';
import { addNpc, newNpc, getNpc } from '../npcs.js';
import { replaceURI, go, vault, cleanPath } from '../obsidian.js';
import * as G from '../apoplay.js';

const {
  play, trip, tierOf, calendar, localeOpen, eventTable, valueNow, bestValue, patientAilment, blockedBy,
  freeReagents, available, hasTool, hasUpgrade, hasItem, skills, namedVariants, curedCount, pointsPerMiss,
  TOOLS, UPGRADES, ITEMS, SKILLS, WITCH_STAGES, STARTING_LOCALES, localeKey, GOLEM_TASKS, VARIANT_SEASONS,
} = G;
import { sources as librarySources } from '../apothecaria.js';
import { getAilment } from '../apothecaria.js';

/** "A", "1–4", "9–Q" for an ailment's card(s). */
const cardRange = (a) => (a.rankMax && a.rankMax !== a.rank ? `${rankLabel(a.rank)}–${rankLabel(a.rankMax)}` : rankLabel(a.rank));

const d = () => ui.drafts;
/** ★★, or an amber ?★ when the potency hasn't been set yet. */
const starStr = (n) => (n ? '★'.repeat(n) : '<span class="warn-text">?★</span>');
const skillName = (id) => SKILLS.find((s) => s.id === id)?.name || '';
const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;

// ---------------------------------------------------------------
// PLAY
// ---------------------------------------------------------------
export function renderPlay() {
  const p = play();
  if (!state.apo.ailments.length || !state.apo.reagents.length) {
    return `<section class="card"><p>To play, paste your ailment and reagent pages in <b>📚 Library</b> first.
      Then link each locale's event table in <b>⚙︎ Setup</b> (optional, but foraging events need it).</p></section>`;
  }
  let body;
  if (p.festival) body = festivalScreen(p);
  else if (p.patient) body = patientScreen(p);
  else if (p.downtime) body = downtimeScreen(p);
  else body = idleScreen(p);
  return statusCard(p) + (p.pendingClue ? clueCard(p) : '') + body + countersCard(p);
}

/** Quests & counters (curses, ALERT, Certainty, Treats, Hurt…). */
function countersCard(p) {
  return `<section class="card"><details ${p.counters.length ? 'open' : ''}><summary><b>📋 Quests & counters</b> <span class="muted small">patients cured: ${curedCount()}</span></summary>
    ${p.counters.map((c) => `<div class="row spread counter-row"><span>${esc(c.name)}</span>
      <span class="row"><button class="icon-btn small" data-act="apoCounter" data-id="${c.id}" data-d="-1">−</button>
      <b>${c.value}${c.max ? `/${c.max}` : ''}</b>
      <button class="icon-btn small" data-act="apoCounter" data-id="${c.id}" data-d="1">＋</button>
      <button class="icon-btn small" data-act="apoCounterDel" data-id="${c.id}" aria-label="Remove">✕</button></span></div>`).join('')}
    <div class="row"><input type="text" id="ctr-name" placeholder="e.g. Curse of Miseries, ALERT, Certainty, Treats"><input type="number" id="ctr-max" placeholder="max" style="max-width:5em">
      <button class="chip" data-act="apoCounterAdd">＋ Add</button></div>
  </details></section>`;
}

function statusCard(p) {
  const cal = calendar();
  const step = (field, label, value) => `<div class="stat">
      <button class="icon-btn small" data-act="apoAdjust" data-field="${field}" data-d="-1" aria-label="${label} down">−</button>
      <div><div class="muted small">${label}</div><b>${value}</b></div>
      <button class="icon-btn small" data-act="apoAdjust" data-field="${field}" data-d="1" aria-label="${label} up">＋</button></div>`;
  const stockN = Object.values(p.stock).reduce((a, b) => a + b, 0);
  return `<section class="card">
    <div class="stats">
      ${step('rep', 'Reputation', `${p.rep} · ${tierOf(p.rep)}`)}
      ${step('silver', 'Silver', p.silver)}
      ${step('week', 'Calendar', `Week ${cal.week} of ${cal.season}${cal.year > 1 ? ` · Y${cal.year}` : ''}`)}
    </div>
    <div class="row spread small muted">
      <span>Stock ${stockN} · Free ${freeReagents().size}${p.familiar?.skill ? ` · 🐾 ${esc(skillName(p.familiar.skill))}` : ''} · Witch: ${WITCH_STAGES[p.witchStage]} (${p.clues.length})</span>
      <button class="chip" data-act="apoNote" title="Write the Apothecary note in Obsidian">↗ Obsidian note</button>
    </div>
  </section>`;
}

function clueCard(p) {
  return `<section class="card notice"><p>🔎 <b>You found a clue about the old witch</b> (${WITCH_STAGES[p.witchStage]}).</p>
    <div class="row"><button class="primary" data-act="apoClue">Draw the clue</button><button data-act="apoClueLater">Later</button></div></section>`;
}

function idleScreen(p) {
  const tier = d().apoDrawTier || tierOf(p.rep);
  const maxTier = TIERS.indexOf(tierOf(p.rep));
  const ails = state.apo.ailments.filter((a) => a.tier === tier).sort((a, b) => a.rank - b.rank);
  const last = p.history.slice(-3).reverse();
  return `<section class="card">
    <h3>Next patient</h3>
    <label>Ailment level
      <select data-change="drawTier">${TIERS.map((t, i) => `<option value="${t}" ${t === tier ? 'selected' : ''} ${i > maxTier ? 'disabled' : ''}>${t}${i < maxTier ? ' (no Reputation)' : ''}</option>`).join('')}</select></label>
    ${librarySources().length > 1 ? `<div class="small">Ailments from: <span class="chip-row">${librarySources().map((src) =>
      `<button class="chip ${!p.sources.length || p.sources.includes(src) ? 'primary' : ''}" data-act="apoSource" data-src="${esc(src)}">${esc(src)}</button>`).join('')}</span></div>` : ''}
    <button class="primary wide" data-act="apoDraw">🂠 Draw a patient${hasUpgrade('ravenloft') ? ' (+ a far-away one)' : ''}</button>
    <details class="help"><summary>Pick the ailment yourself</summary>
      <div class="chip-row">${ails.filter((a) => !p.sources.length || p.sources.includes(a.source)).map((a) => `<button class="chip" data-act="apoPick" data-id="${a.id}">${cardRange(a)} ${esc(a.name)}</button>`).join('') || '<span class="muted small">No ailments at this level.</span>'}</div>
    </details>
    <button class="wide" data-act="apoDowntime">☕ Downtime (6 steps, then a week passes)</button>
  </section>
  ${last.length ? `<section class="card"><h3>Recent</h3>${last.map((h) => {
    const c = calendar(h.week);
    return `<p class="small"><b>${esc(h.ailment)}</b>${h.who ? ` · ${esc(h.who)}` : ''} <span class="muted">· week ${c.week} of ${c.season}</span><br>${esc(h.result)}</p>`;
  }).join('')}</section>` : ''}`;
}

// ----- patient -----
function patientScreen(p) {
  const pt = p.patient, a = patientAilment();
  if (!a) return `<section class="card"><p class="warn">This patient's ailment was deleted from the library.</p><button data-act="apoDrop">Clear patient</button></section>`;
  return patientCard(pt, a) + (pt.far ? farCard(pt.far) : '') + shoppingCard(pt, a) + forageCard(p, pt) + villageCard(p, pt) + brewCard(p, a);
}

function timerView(t, total) {
  if (t.timer == null && t.turns == null) return '<span class="muted small">No timer</span>';
  if (t.timer == null) {
    const over = t.turns > 13;
    return `<span class="${over ? 'warn' : 'muted'} small">No timer · ${t.turns} turn${t.turns === 1 ? '' : 's'}${over ? ' (over 13: −1 Reputation when you finish)' : ' of 13 before it looks uncaring'}</span>`;
  }
  const n = Math.max(total || 0, t.timer);
  const ring = Array.from({ length: n }, (_, i) => `<span class="seg ${i < t.timer ? 'on' : ''}"></span>`).join('');
  return `<span class="timer">${ring}</span> <b class="${t.timer <= 1 ? 'warn' : ''}">${t.timer}</b>
    <button class="icon-btn small" data-act="apoTimer" data-d="-1" aria-label="Timer down">−</button>
    <button class="icon-btn small" data-act="apoTimer" data-d="1" aria-label="Timer up">＋</button>`;
}

/** Tags, specific reagents and special notes an ailment asks for. */
function needsView(a) {
  return `<div>${a.tags.map((t) => `<span class="tag">${esc(t.tag)} ${starStr(t.pot)}</span>`).join(' ')}
    ${(a.needs || []).map((n) => `<span class="tag">${esc(n)}</span>`).join(' ')}
    ${!a.tags.length && !a.needs?.length ? '<span class="warn small">Special cure: read the ailment text.</span>' : ''}</div>
    ${a.extra ? `<p class="small notice-text"><b>Extra:</b> ${esc(a.extra)}</p>` : ''}`;
}

function farCard(far) {
  const a = getAilment(far.ailmentId);
  if (!a) return '';
  return `<section class="card far"><div class="row spread"><h3>🐦 Far away: ${esc(a.name)}</h3><span class="muted small">${esc(a.tier)} ${cardRange(a)}</span></div>
    ${needsView(a)}
    ${far.done ? `<p class="small"><b>${esc(far.result)}</b></p>` : `<div class="row timer-row">${timerView(far, G.startTimer(a))}</div>
      <p class="muted small">Cure them within their Timer for double silver on their potion. In the Brew card, pick "Far away" to give it.</p>`}
    ${a.consequence ? `<p class="small"><b>Consequence:</b> ${esc(a.consequence)}</p>` : ''}
  </section>`;
}

function patientCard(pt, a) {
  const npc = pt.npcId && getNpc(pt.npcId);
  return `<section class="card">
    <div class="row spread"><h3>${esc(a.name)} <span class="muted small">${esc(a.tier)} ${cardRange(a)} · ${esc(a.source)}</span></h3>
      <span class="muted small">${pt.card ? esc(pt.type) : 'chosen'}</span></div>
    ${needsView(a)}
    <div class="row timer-row">${a.timerText ? `<span class="small">Time limit: <b>${esc(a.timerText)}</b> (track it on the calendar)</span>` : timerView(pt, G.startTimer(a))}</div>
    <label>Who is it? <input type="text" data-draft="apoWho" data-change="who" value="${esc(pt.who || '')}" placeholder="Name, a few words"></label>
    <div class="row">${npc ? `<span class="small">👤 NPC card: <b>${esc(npc.name)}</b></span>` : '<button class="chip" data-act="apoNpc">👤 Make an NPC card</button>'}</div>
    ${a.desc ? `<p class="small">${esc(a.desc)}</p>` : ''}
    ${a.consequence ? `<p class="small"><b>Consequence:</b> ${esc(a.consequence)}</p>` : ''}
    ${pt.timer === 0 ? '<p class="warn">⏱ Time is up. Give what you have, or mark it as not cured.</p>' : ''}
  </section>`;
}

function shoppingCard(pt, a) {
  const p = play(), free = freeReagents();
  return `<section class="card"><h3>Shopping list</h3>
    ${a.tags.map((t) => {
      const cures = curesFor(t.tag, t.pot || 1, calendar().season);
      const have = cures.filter((c) => available(c.reagent.id));
      const toFind = cures.filter((c) => !available(c.reagent.id)).slice(0, 4);
      return `<div class="shop-row"><b>${esc(t.tag)} ${starStr(t.pot)}</b>
        ${have.length ? `<span class="ok"> ✓ ${have.map((c) => `${esc(c.reagent.name)}${free.has(c.reagent.id) ? ' (home)' : ''}`).join(', ')}</span>` : ''}
        <div class="chip-row">${toFind.map(({ reagent: r }) => {
          const open = r.locales.filter((l) => localeOpen(l.name)).map((l) => ({ ...l, now: valueNow(r, l.name) })).sort((x, y) => x.now - y.now);
          const where = open.length ? `${open[0].name} ${open[0].now}` : '🔒';
          const blocked = blockedBy(r);
          return `<button class="chip ${pt.target === r.id ? 'primary' : ''}" data-act="apoHunt" data-id="${r.id}" data-loc="${esc(open[0]?.name || '')}" ${blocked ? `title="${esc(blocked)}"` : ''}>
            ${esc(r.name)} ${starStr(r.pot)} · ${esc(where)}${blocked ? ' ⚠︎' : ''}</button>`;
        }).join('') || (have.length ? '' : '<span class="muted small">Nothing in your library cures this at that strength.</span>')}</div>
      </div>`;
    }).join('')}
    <p class="muted small">Tap a reagent to hunt it (goes to its easiest open locale). Numbers are this season's foraging values.</p>
  </section>`;
}

function forageCard(p, t) {
  const locales = [...new Set([...localeNames(), 'Village'])];
  const here = t.locale;
  const target = t.target ? getReagent(t.target) : null;
  const list = here ? state.apo.reagents
    .filter((r) => r.locales.some((l) => localeKey(l.name) === localeKey(here)))
    .map((r) => ({ r, v: valueNow(r, here) })).sort((a, b) => a.v - b.v) : [];
  const tv = target && here ? valueNow(target, here) : null;
  const ld = t.lastDraw;
  const indep = skills().includes('independent') && p.patient && !p.patient.independentUsed;
  const named = here ? namedVariants(here) : [];
  const mods = t.mods || {};
  return `<section class="card"><div class="row spread"><h3>Forage</h3>
      <label class="toggle small"><input type="checkbox" data-act="apoNight" ${p.night ? 'checked' : ''}> 🌙 Night</label></div>
    <label>Locale ${t.travelled ? '<span class="muted small">(moving costs 1 Timer)</span>' : '<span class="muted small">(first trip is free)</span>'}
      <select data-change="travel">
        <option value="">— choose —</option>
        ${locales.map((l) => `<option value="${esc(l)}" ${l === here ? 'selected' : ''} ${localeOpen(l) ? '' : 'disabled'}>${esc(l)}${localeOpen(l) ? '' : ' 🔒'}${eventTable(l) ? '' : ' (no event table)'}</option>`).join('')}
      </select></label>
    ${named.length ? `<label>${esc(here)} is <select data-change="localeMode" data-locale="${esc(here)}">${opt('', 'as usual', p.localeMode[localeKey(here)] || '')}${named.map((n) => opt(n, n, p.localeMode[localeKey(here)] || '')).join('')}</select></label>` : ''}
    ${here ? `<label>Looking for
      <select data-change="target">
        <option value="">— nothing in particular —</option>
        ${list.map(({ r, v }) => `<option value="${r.id}" ${r.id === t.target ? 'selected' : ''}>${esc(r.name)} (${v})${blockedBy(r) ? ' ⚠︎ ' + esc(blockedBy(r)) : ''}${p.stock[r.id] ? ` · have ${p.stock[r.id]}` : ''}</option>`).join('')}
      </select></label>
      ${target && tv == null ? `<p class="warn small">${esc(target.name)} doesn't grow in ${esc(here)}.</p>` : ''}
      ${target && tv != null ? `<p class="small">Need a card of <b>${tv}</b> or higher, or ${tv} foraging points. Points: <b>${t.points}</b>/${tv}</p>` : ''}
      ${target && blockedBy(target) ? `<p class="warn small">⚠︎ ${esc(blockedBy(target))}. You won't be able to collect it.</p>` : ''}
      <button class="primary wide" data-act="apoForage">🂠 Draw (event${target ? ' + search' : ''}, Timer −1)</button>
      <details class="help" ${Object.keys(mods).length ? 'open' : ''}><summary>Event effects for the rest of this ${p.patient ? 'forage' : 'downtime'}${Object.keys(mods).length ? ` (${Object.entries(mods).map(([k, v]) => `${k === 'points' ? 'points/miss' : k} ${v > 0 ? '+' : ''}${v}`).join(', ')})` : ''}</summary>
        <div class="row small">Points per miss: <b>${pointsPerMiss(here)}</b>
          <button class="icon-btn small" data-act="apoMod" data-k="points" data-d="-1">−</button><button class="icon-btn small" data-act="apoMod" data-k="points" data-d="1">＋</button></div>
        <div class="row small">Values of <select id="mod-type">${['all', ...new Set(state.apo.reagents.map((r) => r.type))].map((x) => opt(x, x === 'all' ? 'every reagent' : x)).join('')}</select>
          <button class="chip" data-act="apoModType" data-d="-1">−1</button><button class="chip" data-act="apoModType" data-d="1">＋1</button></div>
      </details>` : ''}
    ${ld ? `<div class="result-card draw-result">
      ${ld.joker ? '<p><b>🃏 Joker</b>: a clue about the old witch!</p>'
        : `<p><b class="${ld.red ? 'red' : ''}">${esc(ld.card)}</b> ${ld.found ? `<span class="ok">✓ Found ${esc(ld.reagent)}!</span>` : ld.reagent && ld.value != null ? `<span class="muted">${ld.points}/${ld.value} points for ${esc(ld.reagent)}</span>` : ''}</p>
        ${ld.event ? `<p class="small ${ld.negated ? 'struck' : ''}">${esc(ld.event)}</p>` : `<p class="muted small">No event table linked for ${esc(here || '')} (⚙︎ Setup).</p>`}
        ${ld.event && !ld.negated && t.adventurers ? '<button class="chip" data-act="apoNegate">🗡 Your adventurer handles it</button>' : ''}
        ${ld.timeUp ? '<p class="warn small">⏱ The timer just ran out.</p>' : ''}`}
    </div>` : ''}
    ${indep ? `<details class="help"><summary>🐾 Send your familiar somewhere else (once this ailment)</summary>
      <div class="row"><select id="indep-loc">${locales.filter((l) => localeOpen(l) && l !== here).map((l) => opt(l, l)).join('')}</select>
      <select id="indep-r">${state.apo.reagents.map((r) => opt(r.id, r.name)).join('')}</select>
      <button class="chip" data-act="apoIndependent">Send</button></div></details>` : ''}
  </section>`;
}

/** The village's services, shown as a fold-out under foraging. */
function villageCard(p, t) {
  const shop = p.shop;
  const stock = Object.entries(p.stock).filter(([, n]) => n > 0).map(([id]) => getReagent(id)).filter(Boolean);
  const timerNote = hasItem('mimic') ? 'the Mimic runs errands: no Timer' : 'Timer −1';
  return `<section class="card"><details ${d().apoVillageOpen ? 'open' : ''} data-act="apoVillageToggle">
    <summary><b>🏘 Village</b> <span class="muted small">(${timerNote} to go there)</span></summary>
    <button class="wide" data-act="apoVillage">Go to the village (${timerNote})</button>
    <div class="village-row"><b>Copper Fox Tavern</b> <span class="muted small">10 silver: an adventurer cancels one event${t.adventurers ? ` · ${t.adventurers} hired` : ''}</span>
      <button class="chip" data-act="apoTavern">Hire</button></div>
    <div class="village-row"><b>Lunar Tower</b> <span class="muted small">draw a card, +half its value in foraging points${t.target ? '' : ' (pick a reagent to hunt first)'}</span>
      <button class="chip" data-act="apoTower">Attune</button></div>
    <div class="village-row"><b>Bits & Bobs</b> <span class="muted small">${timerNote}: draw 3 cards = values in stock; price 2 × highest value</span>
      <button class="chip" data-act="apoBits">Look</button></div>
    ${shop?.cards?.length ? `<div class="shop-cards">${shop.cards.map((c, i) => {
      const opts = state.apo.reagents.filter((r) => r.locales.some((l) => l.value === c.rank)) // the book's printed values.sort((a, b) => a.name.localeCompare(b.name));
      return `<div class="row small"><b class="${c.red ? 'red' : ''}">${esc(c.short)}</b>
        ${c.sold ? `<span class="ok">bought ${esc(c.sold)}</span>` : opts.length ? `<select id="bits-${i}">${opts.map((r) => opt(r.id, `${r.name} — ${G.shopPrice(r)} silver`)).join('')}</select>
        <button class="chip" data-act="apoBitsBuy" data-i="${i}">Buy</button>` : '<span class="muted">nothing of that value</span>'}</div>`;
    }).join('')}</div>` : ''}
    <div class="village-row"><b>Ritual Circle</b> <span class="muted small">${hasTool('athame') ? `${timerNote}, once per ailment: sacrifice reagents worth at least the new one` : 'needs an Athame'}</span></div>
    ${hasTool('athame') && !(p.patient?.ritualUsed) ? `<div class="ritual">
      <label>Make <select id="rit-target">${state.apo.reagents.filter((r) => bestValue(r) != null).sort((a, b) => a.name.localeCompare(b.name)).map((r) => opt(r.id, `${r.name} (${bestValue(r)})`)).join('')}</select></label>
      <div class="chip-row">${stock.map((r) => `<label class="toggle small"><input type="checkbox" class="rit-sac" value="${r.id}"> ${esc(r.name)} (${bestValue(r) ?? '?'})</label>`).join('') || '<span class="muted small">Nothing in stock to sacrifice.</span>'}</div>
      <button class="chip" data-act="apoRitual">Perform the ritual</button></div>` : ''}
  </details></section>`;
}

function brewCard(p, a) {
  const picks = d().apoPicks || {};
  const extras = d().apoExtras || {};
  const free = freeReagents();
  const ids = [...new Set([...Object.keys(p.stock).filter((id) => p.stock[id] > 0), ...free])];
  const stock = ids.map(getReagent).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name));
  const far = p.patient.far && !p.patient.far.done;
  const forFar = far && d().apoBrewFor === 'far';
  const target = forFar ? getAilment(p.patient.far.ailmentId) : a;
  const chosen = Object.entries(picks).filter(([id]) => available(id)).map(([reagentId, part]) => ({ reagentId, part }));
  const c = chosen.length ? G.checkPotion(chosen, extras, forFar ? 'far' : 'main') : null;
  const need = new Set(target.tags.map((t) => t.tag));
  const ex = [];
  if (hasUpgrade('hive')) ex.push(`<label class="toggle small"><input type="checkbox" data-act="apoExtra" data-x="hive" ${extras.hive ? 'checked' : ''} ${p.hiveUses ? '' : 'disabled'}> Hive honey +1 Sweet (${p.hiveUses} left this season)</label>`);
  if (hasItem('sunSugar')) ex.push(`<label class="toggle small"><input type="checkbox" data-act="apoExtra" data-x="sunSugar" ${extras.sunSugar ? 'checked' : ''}> Sun Sugar +3 Sweet</label>`);
  if (hasItem('moonstone') && p.items.moonstone > 0) ex.push(`<label class="toggle small"><input type="checkbox" data-act="apoExtra" data-x="moonstone" ${extras.moonstone ? 'checked' : ''}> Moonstone: remove all Poison (${p.items.moonstone} uses left)</label>`);
  if (skills().includes('helpful')) ex.push(`<label class="small">Helpful familiar <select data-change="helpful">${opt('', 'not used', extras.helpful || '')}${opt('sweet', '+1 Sweet', extras.helpful || '')}${opt('poison', '−1 Poison', extras.helpful || '')}</select></label>`);
  return `<section class="card"><h3>Brew</h3>
    ${far ? `<div class="segmented small-seg"><button class="${forFar ? '' : 'on'}" data-act="apoBrewFor" data-for="main">For ${esc(a.name)}</button>
      <button class="${forFar ? 'on' : ''}" data-act="apoBrewFor" data-for="far">🐦 Far away: ${esc(target === a ? getAilment(p.patient.far.ailmentId)?.name || '' : target.name)}</button></div>` : ''}
    ${stock.length ? stock.map((r) => {
      const on = r.id in picks;
      const useful = r.parts.some((pr) => pr.tags.some((t) => need.has(t)));
      return `<div class="brew-row ${useful ? '' : 'dim'}">
        <label class="toggle"><input type="checkbox" data-act="apoPickReagent" data-id="${r.id}" ${on ? 'checked' : ''}>
          <span><b>${esc(r.name)}</b> ${starStr(r.pot)} <span class="muted small">${free.has(r.id) ? 'home' : `×${p.stock[r.id]}`}</span>
          ${r.poison ? `<span class="poison small">☠${r.poison}</span>` : ''}${r.sweet ? `<span class="sweet small">🍯${r.sweet}</span>` : ''}</span></label>
        ${on && r.parts.length > 1 ? `<select data-change="part" data-id="${r.id}">${r.parts.map((pr) =>
          `<option value="${esc(pr.part)}" ${pr.part === picks[r.id] ? 'selected' : ''}>${esc(pr.part)}: ${pr.methods.join('→')} → ${pr.tags.join(', ')}</option>`).join('')}</select>`
          : `<div class="muted small">${r.parts.map((pr) => `${esc(pr.part)}: ${pr.methods.join('→')} → ${pr.tags.join(', ')}`).join(' · ')}</div>`}
      </div>`;
    }).join('') : '<p class="muted small">Nothing in stock yet. Forage first, or set stock in the Library.</p>'}
    ${ex.length ? `<div class="extras">${ex.join('')}</div>` : ''}
    ${c ? `<div class="potion-check">
      ${c.tags.map((t) => `<span class="tag ${t.ok ? 'ok' : 'bad'}">${t.ok ? '✓' : '✗'} ${esc(t.tag)} ${'★'.repeat(t.need)}${t.wild ? ` (via ${esc(t.wild)})` : ''}${t.have && !t.ok ? ` (best ${'★'.repeat(t.have)})` : ''}</span>`).join(' ')}
      ${c.needs.map((n) => `<span class="tag ${n.ok ? 'ok' : 'bad'}">${n.ok ? '✓' : '✗'} ${esc(n.name)}</span>`).join(' ')}
      ${c.special ? '<p class="warn small">This ailment\'s cure is described in its text: the app counts the potion as a cure, so check it yourself.</p>' : ''}
      <p class="small">Poison ${c.poison} · Sweet ${c.sweet} → ${c.net > 0 ? `${c.net} Poison` : c.net < 0 ? `${-c.net} Sweet` : 'balanced'}
        ${c.toxic ? '<span class="warn"> — 5+ Poison: they won\'t pay, the Consequence happens, −1 Reputation</span>' : ''}</p>
      ${c.causes.length ? `<p class="small poison">Side effects: ${c.causes.map(esc).join(', ')}</p>` : ''}
      ${c.problems.map((x) => `<p class="warn small">⚠︎ ${esc(x)}</p>`).join('')}
      <p class="small"><b>${c.cured && !c.toxic ? `Cures it: +${c.silver} silver${c.rep > 0 ? ', +1 Reputation' : c.counts ? '' : ' (easier ailment: no Reputation)'}` : 'Does not cure it: the Consequence happens'}</b>${c.rep < 0 ? ` · Reputation ${c.rep}` : ''}</p>
    </div>` : ''}
    <div class="row spread">
      <button class="primary" data-act="apoBrew" ${chosen.length ? '' : 'disabled'}>🧪 Give the potion${forFar ? ' (far away)' : ''}</button>
      <button data-act="apoFail">✗ Not cured</button>
      <button class="icon-btn" data-act="apoDrop" title="Remove this patient without a result">↺</button>
    </div>
  </section>`;
}

// ----- downtime -----
function downtimeScreen(p) {
  const t = p.downtime;
  const npcs = state.npcs.filter((n) => !n.archived).sort((a, b) => a.name.localeCompare(b.name));
  return `<section class="card"><h3>☕ Downtime</h3>
    <div class="row timer-row">${timerView(t, 6)}</div>
    <p class="muted small">Each action takes one step: forage (each event), visit the village, or spend time with someone (no reagents from that).</p>
    <div class="row">
      <select id="dt-who"><option value="">Someone…</option>${npcs.map((n) => opt(n.name, n.name)).join('')}</select>
      <button class="chip" data-act="apoSpendTime">💬 Spend time together</button>
    </div>
    ${p.apprentices.length ? `<h4>Apprentices</h4>${p.apprentices.map((ap) => t.apprenticesDone.includes(ap.id)
      ? `<p class="small">✓ ${esc(ap.name)} already collected this downtime.</p>`
      : `<div class="row small"><b>${esc(ap.name)}</b> collects <select id="ap-${ap.id}">${state.apo.reagents.sort((a, b) => a.name.localeCompare(b.name)).map((r) => opt(r.id, r.name)).join('')}</select>
        <button class="chip" data-act="apoApprentice" data-id="${ap.id}">Collect</button></div>`).join('')}` : ''}
    <button class="primary wide" data-act="apoEndDowntime">End downtime (a week passes)</button>
  </section>` + fishingCard(p) + forageCard(p, t) + villageCard(p, t);
}

function fishingCard(p) {
  const t = G.fishingTable();
  if (!t?.columns) return '';
  const rod = G.RODS.find((r) => r.id === p.fishing.rod);
  const f = p.lastFish;
  const col = d().apoFishCol || t.columns[0].name;
  return `<section class="card"><h3>🎣 Fishing <span class="muted small">(a downtime step)</span></h3>
    ${!rod ? '<p class="warn small">You need a fishing rod: 🏡 Home → Fishing gear.</p>' : `<p class="muted small">${esc(rod.name)}${rod.bonus ? `: add 0 to ${rod.bonus} to your draw` : ''}${p.fishing.boat ? ' · boat' : ''}${p.fishing.bulb ? ' · Capture Bulb' : ''}</p>`}
    <div class="chip-row">${t.columns.map((c) => {
      const locked = G.needsBoat(c.name) && !p.fishing.boat;
      return `<button class="chip ${c.name === col ? 'primary' : ''}" data-act="apoFishCol" data-col="${esc(c.name)}" ${locked ? 'disabled title="Needs a boat"' : ''}>${esc(c.name)}${locked ? ' 🔒' : ''}</button>`;
    }).join('')}</div>
    <label class="toggle small"><input type="checkbox" id="fish-chum"> Chum bucket (+2, ${G.CHUM_PRICE} silver)</label>
    ${p.downtime?.fishingOver ? '<p class="warn small">Fishing is over for this downtime.</p>'
      : `<button class="primary wide" data-act="apoFish" ${rod ? '' : 'disabled'}>🂠 Cast (Timer −1)</button>`}
    ${f ? `<div class="result-card draw-result"><p><b class="${f.red ? 'red' : ''}">${esc(f.card)}</b> in ${esc(f.col)}${f.chum ? ' + chum' : ''}</p>
      ${f.taken == null ? `<p class="muted small">${f.options.length > 1 ? 'Pick how much of your rod\'s bonus to use:' : 'Your catch:'}</p>
        ${f.options.map((o, i) => `<button class="catch-opt" data-act="apoCatch" data-i="${i}"><b>${o.total}</b>${o.bonus ? ` <span class="muted small">(+${o.bonus})</span>` : ''} · ${esc(o.text || 'nothing listed')}</button>`).join('')}`
      : `<p><b>${esc(f.result.text)}</b></p>${f.result.notes.length ? `<p class="small ok">${f.result.notes.map(esc).join(' · ')}</p>` : ''}`}
    </div>` : ''}
  </section>`;
}

// ----- festival -----
function festivalScreen(p) {
  const f = p.festival;
  const g = f.games || {};
  const game = (kind, label, help) => `<div class="village-row"><b>${label}</b> <span class="muted small">${help}</span>
    ${g[kind] ? `<p class="small">${esc(g[kind])}</p>` : `<button class="chip" data-act="apoFestGame" data-kind="${kind}">Play</button>`}</div>`;
  const games = {
    Spring: [game('crown', 'The dance', 'draw: King or Queen wins the Flower Crown (PLANT −2)'), bakeGame(f)],
    Summer: [game('rowboat', 'Rowboat race', "2 cards each for you, the champion and the challenger; highest single card wins Bata's Oar")],
    Autumn: [game('crown', 'Spooky Soiree', 'draw: King or Queen wins the Crown of Bones (ANIMAL −2)'), game('speech', 'The speech', 'the village thanks you: 100 silver')],
    Winter: [game('snowball', 'Snowball fight', '5 cards for your side, 4 for theirs; higher total wins'), game('sled', 'Sled race', 'draw: 10 or higher wins 20 silver')],
  }[f.season] || [];
  return `<section class="card"><h3>🎉 ${esc(f.name)}</h3>
    <p class="muted small">No patients or timer: answer as many of the book's festival prompts as you like in your journal. The card games are below.</p>
    ${games.join('')}
    <button class="primary wide" data-act="apoEndFestival">Festival over</button>
  </section>`;
}

function bakeGame(f) {
  const b = f.bake;
  const label = '<b>Baking contest</b> <span class="muted small">closest to 21 without going over (J/Q/K = 10, A = 1 or 11) vs 3 face-down cards; win a year of Sun Sugar</span>';
  if (f.games?.bake && (!b || b.done)) return `<div class="village-row">${label}<p class="small">${esc(f.games.bake)}</p></div>`;
  if (!b) return `<div class="village-row">${label}<button class="chip" data-act="apoFestGame" data-kind="bake-start">Enter</button></div>`;
  return `<div class="village-row">${label}<p class="small">Your cards: ${b.you.map((r) => rankLabel(r)).join(' ')} (${G.bjValue(b.you)})</p>
    <div class="row"><button class="chip" data-act="apoFestGame" data-kind="bake-hit">Draw another</button><button class="chip" data-act="apoFestGame" data-kind="bake-stay">Stay</button></div></div>`;
}

// ---------------------------------------------------------------
// HOME: familiar, apprentices, tools, upgrades, items
// ---------------------------------------------------------------
export function renderHome() {
  const p = play();
  return familiarCard(p) + toolsCard(p) + (G.fishingTable() ? fishingGearCard(p) : '') + upgradesCard(p) + itemsCard(p) + (hasItem('golem') ? golemCard(p) : '') + customCard(p) + shopsCard(p);
}

function fishingGearCard(p) {
  const f = p.fishing;
  return `<section class="card"><h3>🎣 Fishing gear</h3>
    <label>Rod <select data-change="fishRod">${opt('', '— none —', f.rod)}${G.RODS.map((r) => opt(r.id, `${r.name}${r.bonus ? ` (up to +${r.bonus})` : ''}${r.price ? ` · ${r.price} silver` : ' · found, not bought'}`, f.rod)).join('')}</select></label>
    ${G.RODS.filter((r) => r.price && r.id !== f.rod).map((r) => `<button class="chip" data-act="apoBuyRod" data-id="${r.id}">Buy ${esc(r.name)} (${r.price})</button>`).join(' ')}
    <label class="toggle"><input type="checkbox" data-act="apoFishFlag" data-k="boat" ${f.boat ? 'checked' : ''}> Boat <span class="muted small">(fish where Setup says a boat is needed)</span></label>
    <label class="toggle"><input type="checkbox" data-act="apoFishFlag" data-k="bulb" ${f.bulb ? 'checked' : ''}> Capture Bulb <span class="muted small">(catch them alive)</span></label>
  </section>`;
}

function golemCard(p) {
  const g = p.golem;
  const list = [...(g.search || []), ''].slice(0, 10);
  return `<section class="card"><h3>🗿 Golem's task this season</h3>
    <select data-change="golemTask">${opt('', '— no task —', g.task)}${Object.entries(GOLEM_TASKS).map(([k, v]) => opt(k, v, g.task)).join('')}</select>
    ${g.task === 'make' ? `<label>Build <select data-change="golemMake">${opt('', '— choose —', g.make)}${UPGRADES.map((u) => opt(u.id, u.name, g.make)).join('')}</select></label>` : ''}
    ${g.task === 'search' ? `<div class="muted small">Shopping list (up to 10):</div>${list.map((id, i) => `<select data-change="golemSearch" data-i="${i}">${opt('', '—', id)}${state.apo.reagents.slice().sort((a, b) => a.name.localeCompare(b.name)).map((r) => opt(r.id, r.name, id)).join('')}</select>`).join('')}` : ''}
    <p class="muted small">Done automatically when the season ends.</p>
  </section>`;
}

/** Your own gear: expansion tools, upgrades, boons… with simple effects. */
function customCard(p) {
  const types = [...new Set(state.apo.reagents.map((r) => r.type))];
  return `<section class="card"><h3>🧩 Your own gear <span class="muted small">(expansion tools, upgrades, boons)</span></h3>
    ${p.custom.map((c) => `<div class="row spread tool-row"><label class="toggle"><input type="checkbox" data-act="apoCustomOn" data-id="${c.id}" ${c.on !== false ? 'checked' : ''}>
      <span><b>${esc(c.name)}</b><br><span class="muted small">${esc([c.note, c.points ? `${c.points > 0 ? '+' : ''}${c.points} points per miss` : '', c.type && c.delta ? `${c.type} values ${c.delta > 0 ? '+' : ''}${c.delta}` : '', c.timer ? `Timers ${c.timer > 0 ? '+' : ''}${c.timer}` : '', c.ease ? `${c.ease} need 1★ less` : '', c.freeA && c.freeB ? `free moves ${c.freeA} ↔ ${c.freeB}` : ''].filter(Boolean).join(' · '))}</span></span></label>
      <button class="icon-btn" data-act="apoCustomDel" data-id="${c.id}" aria-label="Remove">✕</button></div>`).join('') || '<p class="muted small">Nothing yet.</p>'}
    <details class="help"><summary>＋ Add gear</summary>
      <label>Name <input type="text" id="cg-name" placeholder="e.g. Lantern, Wisp, Hot Tub, Skis"></label>
      <label>What it does (note) <input type="text" id="cg-note" placeholder="e.g. lets you explore at night"></label>
      <div class="row small"><label>Points per miss <input type="number" id="cg-points" value="0" style="max-width:5em"></label>
        <label>Timers <input type="number" id="cg-timer" value="0" style="max-width:5em"></label></div>
      <div class="row small"><label>Values of <select id="cg-type">${opt('', '—')}${types.map((t) => opt(t, t)).join('')}</select></label>
        <label>by <input type="number" id="cg-delta" value="0" style="max-width:5em"></label></div>
      <label>Tags needing 1★ less <input type="text" id="cg-ease" placeholder="e.g. MOOD, SENSES"></label>
      <div class="row small"><label>Free moves between <input type="text" id="cg-a" placeholder="Locale"></label><label>and <input type="text" id="cg-b" placeholder="Locale"></label></div>
      <button class="chip" data-act="apoCustomAdd">Add</button>
    </details>
  </section>`;
}

/** Shops: card tables like The Modern Witch Catalogue's merchants. */
function shopsCard(p) {
  const shops = (state.apo.shops || []).map((id) => G.getShopTable(id)).filter(Boolean);
  const b = p.browse;
  return `<section class="card"><h3>🛍 Shops</h3>
    ${shops.length ? `<div class="chip-row">${shops.map((t) => `<button class="chip" data-act="apoBrowse" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
      <p class="muted small">Browsing draws 5 cards${p.downtime ? ' and takes a downtime step' : ''}. Link shop tables in ⚙︎ Setup.</p>`
      : '<p class="muted small">Paste a merchant\'s pages as a card table (labels like <code>7♥</code>), then link it in ⚙︎ Setup → Shops.</p>'}
    ${b?.items?.length ? `<h4>${esc(b.name)}</h4>${b.items.map((it, i) => `<div class="village-row"><b class="${it.red ? 'red' : ''}">${esc(it.card)}</b> ${esc(it.text)}
      ${it.bought ? '<span class="ok small">bought</span>' : `<button class="chip" data-act="apoBuyProduct" data-i="${i}">Buy${it.price ? ` (${it.price})` : ''}</button>`}</div>`).join('')}` : ''}
    ${p.owned.length ? `<h4>Owned</h4>${p.owned.map((o, i) => `<div class="row spread small"><span>${esc(o.name)}</span><button class="icon-btn small" data-act="apoOwnedDel" data-i="${i}">✕</button></div>`).join('')}` : ''}
  </section>`;
}

function helperFields(who, h) {
  const waysOpts = state.apo.reagents.filter((r) => Math.min(...r.locales.map((l) => l.value)) <= 7).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <label>Skill <span class="muted small">${h?.skill ? esc(SKILLS.find((s) => s.id === h.skill)?.note || '') : ''}</span>
      <div class="row"><select data-change="helperSkill" data-who="${who}">${opt('', '— none —', h?.skill || '')}${SKILLS.map((s) => opt(s.id, `${rankLabel(s.rank)}${s.rank === 12 ? '/K' : ''} · ${s.name}`, h?.skill || '')).join('')}</select>
      <button class="chip" data-act="apoDrawSkill" data-who="${who}">🂠 Draw</button></div></label>
    ${h?.skill === 'useful' ? `<label>Works as <select data-change="helperTool" data-who="${who}">${opt('', '— choose a tool —', h.tool || '')}${TOOLS.map((t) => opt(t.id, t.name, h.tool || '')).join('')}</select></label>` : ''}
    ${h?.skill === 'ways' ? `<label>Always brings <select data-change="helperWays" data-who="${who}">${opt('', '— choose (value 7 or less) —', h.ways || '')}${waysOpts.map((r) => opt(r.id, r.name, h.ways || '')).join('')}</select></label>` : ''}`;
}

function familiarCard(p) {
  const f = p.familiar;
  return `<section class="card"><h3>🐾 Familiar</h3>
    ${f ? `<label>Name <input type="text" data-change="famName" value="${esc(f.name || '')}"></label>
      <label>Form <div class="row"><input type="text" data-change="famForm" value="${esc(f.form || '')}" placeholder="e.g. a one-eyed raven">
        <button class="chip" data-act="apoDrawForm">🂠 Draw</button></div></label>
      ${helperFields('familiar', f)}
      <button class="chip danger" data-act="apoNoFamiliar">Remove familiar</button>`
    : `<p class="muted small">Find one, adopt one, or perform The Calling. Its skill is drawn, not chosen.</p>
      <button class="primary" data-act="apoNewFamiliar">＋ Add a familiar</button>`}
  </section>
  <section class="card"><h3>🧑‍🎓 Apprentices</h3>
    ${p.apprentices.map((ap) => `<div class="helper">
      <div class="row"><input type="text" data-change="apName" data-who="${ap.id}" value="${esc(ap.name)}"><button class="icon-btn" data-act="apoRemoveApprentice" data-id="${ap.id}" aria-label="Remove">✕</button></div>
      ${helperFields(ap.id, ap)}</div>`).join('') || `<p class="muted small">${hasUpgrade('spareroom') ? '' : 'Build a Spare Room (Reputation 30+) to take one on. '}Apprentices collect one reagent each downtime and add their own skill.</p>`}
    <button class="chip" data-act="apoAddApprentice">＋ Apprentice</button>
  </section>`;
}

function toolsCard(p) {
  return `<section class="card"><h3>🧰 Tools</h3>
    ${TOOLS.map((t) => {
      const own = p.tools.includes(t.id);
      const viaHelper = !own && hasTool(t.id);
      return `<div class="row spread tool-row"><label class="toggle"><input type="checkbox" data-act="apoToggleTool" data-id="${t.id}" ${own ? 'checked' : ''}>
        <span><b>${esc(t.name)}</b>${t.price ? ` <span class="muted small">${t.price} silver</span>` : ''}${viaHelper ? ' <span class="ok small">(your Useful helper)</span>' : ''}${t.note ? `<br><span class="muted small">${esc(t.note)}</span>` : ''}</span></label>
        ${!own && t.price ? `<button class="chip" data-act="apoBuy" data-id="${t.id}">Buy</button>` : ''}</div>`;
    }).join('')}
    <p class="muted small">Buy pays from your silver. Ticking the box gives it for free (found, gifted, house rules).</p>
  </section>`;
}

function upgradesCard(p) {
  const locales = [...new Set([...localeNames(), 'Village'])];
  return `<section class="card"><h3>🏡 Upgrades</h3>
    <p class="muted small">Reagents kept in an upgrade are always available: no foraging, and brewing doesn't use them up. The book lets you change them at the start of each season.</p>
    ${p.upgrades.map((u) => {
      const def = UPGRADES.find((x) => x.id === u.type);
      if (!def) return '';
      const choices = def.hold ? G.upgradeChoices(def.id) : [];
      return `<div class="helper"><div class="row spread"><b>${esc(def.name)}</b><button class="icon-btn" data-act="apoRemoveUpgrade" data-id="${u.id}" aria-label="Remove">✕</button></div>
        <div class="muted small">${esc(def.note)}</div>
        ${def.hold ? Array.from({ length: def.hold.n }, (_, i) => `<select data-change="upgradeReagent" data-id="${u.id}" data-i="${i}">
          ${opt('', '— empty —', u.reagents[i] || '')}${choices.map((r) => opt(r.id, r.name, u.reagents[i] || '')).join('')}</select>`).join('') : ''}
        ${def.link ? [0, 1].map((i) => `<select data-change="upgradeLocale" data-id="${u.id}" data-i="${i}">${opt('', '— locale —', u.locales[i] || '')}${locales.map((l) => opt(l, l, u.locales[i] || '')).join('')}</select>`).join(' ↔ ') : ''}
      </div>`;
    }).join('') || '<p class="muted small">No upgrades yet.</p>'}
    <details class="help"><summary>＋ Build an upgrade</summary>
      ${UPGRADES.map((u) => `<div class="row spread tool-row"><span><b>${esc(u.name)}</b> <span class="muted small">${u.price} silver${u.minRep ? `, Reputation ${u.minRep}+` : ''}</span><br><span class="muted small">${esc(u.note)}</span></span>
        <span class="row"><button class="chip" data-act="apoBuild" data-type="${u.id}">Buy</button><button class="chip ghost" data-act="apoBuildFree" data-type="${u.id}" title="Add without paying">Free</button></span></div>`).join('')}
    </details>
  </section>`;
}

function itemsCard(p) {
  return `<section class="card"><h3>✨ Special items</h3>
    ${ITEMS.map((it) => `<div class="row spread tool-row"><label class="toggle"><input type="checkbox" data-act="apoItem" data-id="${it.id}" ${p.items[it.id] ? 'checked' : ''}>
      <span><b>${esc(it.name)}</b><br><span class="muted small">${esc(it.note)}</span></span></label>
      ${it.uses && p.items[it.id] ? `<span class="row small"><button class="icon-btn small" data-act="apoItemUses" data-id="${it.id}" data-d="-1">−</button>${p.items[it.id]}<button class="icon-btn small" data-act="apoItemUses" data-id="${it.id}" data-d="1">＋</button></span>` : ''}</div>`).join('')}
  </section>`;
}

// ---------------------------------------------------------------
// SETUP (shared tables) + story locales
// ---------------------------------------------------------------
export function renderSetup() {
  const p = play();
  const cardTables = visibleTables().filter((t) => t.die === 'card').sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name));
  const opts = (sel) => `<option value="">— none —</option>${cardTables.map((t) =>
    `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.folder)} › ${esc(t.name)}</option>`).join('')}`;
  const locales = [...new Set([...localeNames(), 'Village'])];
  const lt = state.apo.localeTables || {};
  const wt = state.apo.witchTables || [];
  const story = localeNames().filter((l) => !STARTING_LOCALES.includes(localeKey(l)) && !TOOLS.some((t) => t.unlocks && localeKey(l).startsWith(t.unlocks)));
  return `<section class="card"><h3>Locale event tables</h3>
    <p class="muted small">Paste each locale's event page as a <b>card table</b> (Tables → Bulk paste, under a <code># Name</code> heading), then pick it here. Shared by all campaigns.</p>
    ${!cardTables.length ? '<p class="warn small">No card tables yet.</p>' : ''}
    ${locales.map((l) => {
      const vars = state.apo.localeVariants?.[localeKey(l)] || [];
      return `<div class="variant-block"><label>${esc(l)} <select data-change="localeTable" data-locale="${esc(l)}">${opts(lt[localeKey(l)])}</select></label>
        ${vars.map((v, i) => `<div class="row small variant-row">↳ <select data-change="variantWhen" data-locale="${esc(l)}" data-i="${i}">${['Night', ...VARIANT_SEASONS].map((w) => opt(w, w, v.when)).join('')}${!['Night', ...VARIANT_SEASONS].includes(v.when) ? opt(v.when, v.when, v.when) : ''}</select>
          <select data-change="variantTable" data-locale="${esc(l)}" data-i="${i}">${opts(v.table)}</select>
          <button class="icon-btn small" data-act="apoVariantDel" data-locale="${esc(l)}" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
        <div class="row small"><button class="chip ghost" data-act="apoVariantAdd" data-locale="${esc(l)}" data-when="Night">＋ Night</button>
          <button class="chip ghost" data-act="apoVariantAdd" data-locale="${esc(l)}" data-when="season">＋ Season</button>
          <button class="chip ghost" data-act="apoVariantAdd" data-locale="${esc(l)}" data-when="named">＋ Named (e.g. Fixed)</button></div></div>`;
    }).join('')}
    <p class="muted small">Variants replace the default table: <b>Night</b> when 🌙 is on (Nightfall), a <b>season</b> (Dance of Seasons), or a <b>named</b> state you switch on in Play (e.g. "Fixed" after a curse is broken, "Guised").</p>
  </section>
  <section class="card"><h3>Fishing</h3>
    ${(() => {
      const grids = visibleTables().filter((t) => t.columns).sort((a, b) => a.name.localeCompare(b.name));
      const ft = G.fishingTable();
      return `<label>Fishing grid table <select data-change="fishingTable">${opt('', '— none —', state.apo.fishingTable || '')}${grids.map((t) => opt(t.id, `${t.folder} › ${t.name}`, state.apo.fishingTable || '')).join('')}</select></label>
        ${!grids.length ? '<p class="muted small">Make a grid table (Tables → ＋ New) with one <code>## Column</code> per fishing spot, rows by number (1–19). Write <code>[[Pirate Chests]]</code> in a cell to roll another table automatically.</p>' : ''}
        ${ft?.columns ? `<div class="muted small">Needs a boat:</div>${ft.columns.map((c) => `<label class="toggle small"><input type="checkbox" data-act="apoBoatCol" data-col="${esc(c.name)}" ${G.needsBoat(c.name) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}` : ''}`;
    })()}
  </section>
  <section class="card"><h3>Shops</h3>
    ${(state.apo.shops || []).map((id, i) => `<div class="row"><select data-change="shopTable" data-i="${i}">${opts(id)}</select><button class="icon-btn small" data-act="apoShopDel" data-i="${i}">✕</button></div>`).join('')}
    <button class="chip ghost" data-act="apoShopAdd">＋ Shop table</button>
  </section>
  <section class="card"><h3>Witch clue tables</h3>
    ${WITCH_STAGES.map((s, i) => `<label>${i + 1}. ${esc(s)} <select data-change="witchTable" data-i="${i}">${opts(wt[i])}</select></label>`).join('')}
    <label>Current stage (this campaign)
      <select data-change="witchStage">${WITCH_STAGES.map((s, i) => `<option value="${i}" ${i === p.witchStage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <p class="muted small">Your first Joker is always a First Steps clue. Move up a stage whenever you like (faster game) or stay longer (slower).</p>
  </section>
  <section class="card"><h3>Familiar forms table</h3>
    <label>Card table for "🂠 Draw" on the familiar's form <select data-change="familiarTable">${opts(state.apo.familiarTable)}</select></label>
  </section>
  ${story.length ? `<section class="card"><h3>Story locales <span class="muted small">(this campaign)</span></h3>
    <p class="muted small">Locales that open through the story rather than a tool.</p>
    ${story.map((l) => `<label class="toggle"><input type="checkbox" data-act="apoUnlock" data-locale="${esc(l)}" ${localeOpen(l) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
  </section>` : ''}`;
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------
function after(res) {
  if (!res) return;
  const msg = [res.reason, ...(res.notes || [])].filter(Boolean).join(' · ');
  if (msg) toast(msg.slice(0, 180));
}
const say = (err) => { if (err) toast(err); };

export const playActions = {
  apoAdjust: (el) => G.adjust(el.dataset.field, +el.dataset.d),
  apoDraw: () => {
    const r = G.drawPatient(d().apoDrawTier || tierOf(play().rep));
    d().apoPicks = {}; d().apoExtras = {};
    if (r.jokers) toast(`🃏 Joker${r.jokers > 1 ? 's' : ''}: a Witch clue!`);
    if (!r.ok) toast(r.message);
  },
  apoPick: (el) => { G.startPatient(el.dataset.id); d().apoPicks = {}; d().apoExtras = {}; },
  apoDowntime: () => G.startDowntime(),
  apoEndDowntime: () => after(G.endDowntime()),
  apoSpendTime: () => G.spendTime(document.getElementById('dt-who')?.value),
  apoApprentice: (el) => G.apprenticeCollect(el.dataset.id, document.getElementById(`ap-${el.dataset.id}`)?.value),
  apoClue: () => { const r = G.rollClue(); toast(r.message || `Clue: ${r.text}`.slice(0, 180)); },
  apoClueLater: () => { play().pendingClue = false; save('apoPlay'); emit(); },
  apoTimer: (el) => G.adjustTimer(+el.dataset.d),
  apoHunt: (el) => {
    const loc = el.dataset.loc;
    if (loc && trip().locale !== loc) G.travel(loc);
    G.setTarget(el.dataset.id);
  },
  apoForage: () => { const r = G.forageDraw(); if (r?.message) toast(r.message); },
  apoNegate: () => G.negateEvent(),
  apoIndependent: () => {
    const r = G.sendIndependent(document.getElementById('indep-r').value, document.getElementById('indep-loc').value);
    if (r) toast(`${r.card} vs ${r.value ?? '—'}: ${r.found ? 'they found it!' : 'nothing this time'}`);
  },
  apoVillageToggle: (el, e) => { if (e.target.tagName === 'SUMMARY' || e.target.closest('summary')) d().apoVillageOpen = !el.open; },
  apoVillage: () => G.visitVillage(),
  apoTavern: () => say(G.hireAdventurer()),
  apoTower: () => { const r = G.lunarTower(); if (r) toast(`${r.card}: +${r.n} foraging points${r.found ? ' — found it!' : ''}`); },
  apoBits: () => { d().apoVillageOpen = true; G.bitsAndBobs(); },
  apoBitsBuy: (el) => say(G.shopBuy(+el.dataset.i, document.getElementById(`bits-${el.dataset.i}`).value)),
  apoRitual: () => {
    const sac = [...document.querySelectorAll('.rit-sac:checked')].map((x) => x.value);
    const err = G.ritual(document.getElementById('rit-target').value, sac);
    toast(err || 'The ritual works.');
  },
  apoExtra: (el) => { (d().apoExtras ||= {})[el.dataset.x] = el.checked; emit(); },
  apoPickReagent: (el) => {
    const picks = (d().apoPicks ||= {});
    if (el.checked) {
      // Default to the part that covers the most needed tags.
      const r = getReagent(el.dataset.id), need = new Set(patientAilment().tags.map((t) => t.tag));
      const best = [...r.parts].sort((a, b) => b.tags.filter((t) => need.has(t)).length - a.tags.filter((t) => need.has(t)).length)[0];
      picks[el.dataset.id] = best?.part || '';
    } else delete picks[el.dataset.id];
    emit();
  },
  apoBrew: () => {
    const picks = Object.entries(d().apoPicks || {}).filter(([id]) => available(id)).map(([reagentId, part]) => ({ reagentId, part }));
    if (!picks.length) return;
    const extras = d().apoExtras || {};
    d().apoPicks = {}; d().apoExtras = {};
    if (d().apoBrewFor === 'far' && play().patient.far && !play().patient.far.done) {
      d().apoBrewFor = 'main';
      const c = G.finishFar(picks, extras);
      if (c) toast(play().patient.far.result);
      return;
    }
    after(G.finishPatient(picks, 'cured', extras));
  },
  apoFail: () => { d().apoPicks = {}; d().apoExtras = {}; after(G.finishPatient([], 'failed')); },
  apoDrop: () => { d().apoPicks = {}; G.dropPatient(); },
  apoNpc: () => {
    const pt = play().patient, a = patientAilment();
    const n = newNpc(pt.who || `${pt.type || 'Patient'} with ${a.name}`);
    n.role = `Patient${pt.type ? ` · ${pt.type}` : ''}`;
    n.notes = `Treated for ${a.name} (${calendar().season}, week ${calendar().week}).`;
    addNpc(n);
    G.linkNpc(n.id);
    toast(`NPC card made: ${n.name}`);
  },
  apoNote: () => go(replaceURI(`${cleanPath(vault().apothecaryNote || 'Apothecary')}`, G.apothecaryNote())),
  // festival
  apoFestGame: (el) => { const r = G.festivalGame(el.dataset.kind); if (r) toast(r.text.slice(0, 180)); },
  apoEndFestival: () => G.endFestival(),
  // home
  apoBuy: (el) => say(G.buyTool(el.dataset.id)),
  apoToggleTool: (el) => G.toggleTool(el.dataset.id),
  apoBuild: (el) => say(G.addUpgrade(el.dataset.type, true)),
  apoBuildFree: (el) => say(G.addUpgrade(el.dataset.type, false)),
  apoRemoveUpgrade: (el) => G.removeUpgrade(el.dataset.id),
  apoItem: (el) => { const it = ITEMS.find((x) => x.id === el.dataset.id); G.setItem(it.id, el.checked ? (it.uses || true) : false); },
  apoItemUses: (el) => G.setItem(el.dataset.id, Math.max(1, (play().items[el.dataset.id] || 0) + +el.dataset.d)),
  apoNewFamiliar: () => G.setHelper('familiar', {}),
  apoNoFamiliar: () => { play().familiar = null; save('apoPlay'); emit(); },
  apoDrawSkill: (el) => { const r = G.drawSkill(el.dataset.who); if (r) toast(`${r.card}: ${r.skill.name} — ${r.skill.note}`); },
  apoDrawForm: () => { const r = G.drawForm(); toast(r.message || `${r.shown}: ${r.text}`.slice(0, 160)); },
  apoAddApprentice: () => G.addApprentice(),
  apoRemoveApprentice: (el) => G.removeApprentice(el.dataset.id),
  apoUnlock: (el) => G.toggleUnlock(el.dataset.locale),
  // v0.7.5
  apoSource: (el) => {
    const p = play(), all = librarySources();
    let on = p.sources.length ? [...p.sources] : [...all];
    on = on.includes(el.dataset.src) ? on.filter((x) => x !== el.dataset.src) : [...on, el.dataset.src];
    p.sources = on.length === all.length ? [] : on;
    save('apoPlay'); emit();
  },
  apoCounter: (el) => G.adjustCounter(el.dataset.id, +el.dataset.d),
  apoCounterDel: (el) => G.removeCounter(el.dataset.id),
  apoCounterAdd: () => {
    const n = document.getElementById('ctr-name').value.trim();
    if (!n) return toast('Give it a name');
    G.addCounter(n, document.getElementById('ctr-max').value);
  },
  apoNight: (el) => G.setNight(el.checked),
  apoMod: (el) => G.tripMod(el.dataset.k, +el.dataset.d),
  apoModType: (el) => G.tripMod(document.getElementById('mod-type').value, +el.dataset.d),
  apoBrewFor: (el) => { d().apoBrewFor = el.dataset.for; d().apoPicks = {}; emit(); },
  apoCustomOn: (el) => G.updateCustom(el.dataset.id, { on: el.checked }),
  apoCustomDel: (el) => G.removeCustom(el.dataset.id),
  apoCustomAdd: () => {
    const v = (id) => document.getElementById(id).value.trim();
    if (!v('cg-name')) return toast('Give it a name');
    G.addCustom({ name: v('cg-name'), note: v('cg-note'), points: +v('cg-points') || 0, timer: +v('cg-timer') || 0,
      type: v('cg-type'), delta: +v('cg-delta') || 0, ease: v('cg-ease').toUpperCase(), freeA: v('cg-a'), freeB: v('cg-b') });
  },
  apoBrowse: (el) => G.browseShop(el.dataset.id),
  apoBuyProduct: (el) => say(G.buyProduct(+el.dataset.i)),
  apoOwnedDel: (el) => G.removeOwned(+el.dataset.i),
  apoShopAdd: () => { (state.apo.shops ||= []).push(''); save('apo'); emit(); },
  apoShopDel: (el) => { state.apo.shops.splice(+el.dataset.i, 1); save('apo'); emit(); },
  apoVariantAdd: async (el) => {
    let when = el.dataset.when;
    if (when === 'season') when = calendar().season;
    if (when === 'named') {
      const { askText } = await import('../ui.js');
      when = (await askText('Name this variant (e.g. Fixed, Guised, Captured)', ''))?.trim();
      if (!when) return;
    }
    const k = localeKey(el.dataset.locale);
    ((state.apo.localeVariants ||= {})[k] ||= []).push({ when, table: '' });
    save('apo'); emit();
  },
  apoFishCol: (el) => { d().apoFishCol = el.dataset.col; emit(); },
  apoFish: () => {
    const t = G.fishingTable();
    const r = G.fishDraw(d().apoFishCol || t.columns[0].name, document.getElementById('fish-chum')?.checked);
    if (r?.message) toast(r.message);
  },
  apoCatch: (el) => { const r = G.takeCatch(+el.dataset.i); if (r) toast(r.text.slice(0, 160)); },
  apoBuyRod: (el) => {
    const rod = G.RODS.find((r) => r.id === el.dataset.id), p = play();
    if (p.silver < rod.price) return toast(`Not enough silver (${rod.price}).`);
    p.silver -= rod.price;
    G.setFishing({ rod: rod.id });
  },
  apoFishFlag: (el) => G.setFishing({ [el.dataset.k]: el.checked }),
  apoBoatCol: (el) => { (state.apo.fishingBoat ||= {})[el.dataset.col] = el.checked; save('apo'); emit(); },
  apoVariantDel: (el) => { state.apo.localeVariants[localeKey(el.dataset.locale)].splice(+el.dataset.i, 1); save('apo'); emit(); },
};

/** Fields marked data-change="…". */
export function onPlayChange(el) {
  const v = el.value, ds = el.dataset;
  switch (ds.change) {
    case 'drawTier': d().apoDrawTier = v; emit(); break;
    case 'who': G.setWho(v); break;
    case 'travel': if (v) G.travel(v); break;
    case 'target': G.setTarget(v || null); break;
    case 'part': (d().apoPicks ||= {})[ds.id] = v; emit(); break;
    case 'helpful': (d().apoExtras ||= {}).helpful = v; emit(); break;
    case 'localeTable': (state.apo.localeTables ||= {})[localeKey(ds.locale)] = v || undefined; save('apo'); emit(); break;
    case 'witchTable': (state.apo.witchTables ||= [])[+ds.i] = v || null; save('apo'); emit(); break;
    case 'familiarTable': state.apo.familiarTable = v || null; save('apo'); emit(); break;
    case 'witchStage': G.setWitchStage(+v); break;
    case 'famName': G.setHelper('familiar', { name: v }); break;
    case 'famForm': G.setHelper('familiar', { form: v }); break;
    case 'apName': G.setHelper(ds.who, { name: v }); break;
    case 'helperSkill': G.setHelper(ds.who, { skill: v }); break;
    case 'helperTool': G.setHelper(ds.who, { tool: v }); break;
    case 'helperWays': G.setHelper(ds.who, { ways: v }); break;
    case 'upgradeReagent': {
      const u = play().upgrades.find((x) => x.id === ds.id);
      const list = [...(u.reagents || [])];
      list[+ds.i] = v;
      G.setUpgradeReagents(ds.id, list);
      break;
    }
    case 'upgradeLocale': {
      const u = play().upgrades.find((x) => x.id === ds.id);
      const list = [...(u.locales || [])];
      list[+ds.i] = v;
      G.setUpgradeLocales(ds.id, list);
      break;
    }
    case 'fishRod': G.setFishing({ rod: v }); break;
    case 'fishingTable': state.apo.fishingTable = v || null; save('apo'); emit(); break;
    case 'localeMode': G.setLocaleMode(ds.locale, v); break;
    case 'golemTask': G.setGolem({ task: v }); break;
    case 'golemMake': G.setGolem({ make: v }); break;
    case 'golemSearch': { const l = [...(play().golem.search || [])]; l[+ds.i] = v; G.setGolem({ search: l.filter(Boolean) }); break; }
    case 'shopTable': state.apo.shops[+ds.i] = v; save('apo'); emit(); break;
    case 'variantWhen': state.apo.localeVariants[localeKey(ds.locale)][+ds.i].when = v; save('apo'); emit(); break;
    case 'variantTable': state.apo.localeVariants[localeKey(ds.locale)][+ds.i].table = v; save('apo'); emit(); break;
    default:
  }
}
