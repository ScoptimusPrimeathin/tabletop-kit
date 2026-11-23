// =============================================================
// views/mythic.js — Mythic GME 2e screen
// Sub-screens: Play · Lists · Thread · Keyed
// =============================================================

import { state, ui, save, emit } from '../state.js';
import * as M from '../mythic.js';
import { addLog } from '../log.js';
import { folderPaths, visibleTables } from '../tables.js';
import { syncCharacters, getNpc, attitudeName } from '../npcs.js';
import { esc, toast, sheet, closeSheet, askConfirm } from '../ui.js';

export const title = 'Mythic';
const s = () => state.mythic;
const sub = () => ui.drafts.mythicSub || 'play';

export function render() {
  M.ensureMythicLists();
  M.migrate();
  const tabs = [['play', 'Play'], ['lists', 'Lists'], ['thread', 'Thread'], ['keyed', 'Keyed']];
  return `
  <div class="segmented">${tabs.map(([id, label]) =>
    `<button class="${sub() === id ? 'on' : ''}" data-act="sub" data-sub="${id}">${label}</button>`).join('')}</div>
  ${renderSetupNotice()}
  ${ui.results.mythic ? `<section class="card result-card">${renderResult(ui.results.mythic)}</section>` : ''}
  ${{ play: renderPlay, lists: renderLists, thread: renderThread, keyed: renderKeyed }[sub()]()}
  <section class="card"><button class="wide" data-act="setup">⚙︎ Mythic setup</button></section>`;
}

// ---------------------------------------------------------------
// Setup notice: lists what's still missing
// ---------------------------------------------------------------
function renderSetupNotice() {
  const missing = [];
  if (!M.isReady()) missing.push(M.rules().method === 'check' ? `Fate Check modifiers (${M.VARIANTS[M.rules().variant]})` : `Fate chart (${M.VARIANTS[M.rules().variant]})`);
  if (!s().focusTable) missing.push('Event Focus table');
  if (!M.meaningOptions().length) missing.push('meaning tables');
  if (!missing.length) return '';
  return `<section class="card notice"><b>Setup needed:</b> ${missing.map(esc).join(', ')}.
    Until then, fate questions use a custom % chance.
    <button data-act="setup">Open setup</button></section>`;
}

// ---------------------------------------------------------------
// PLAY
// ---------------------------------------------------------------
function renderPlay() {
  const labels = M.oddsLabels();
  const mid = labels.find((l) => /50/.test(l)) || labels[Math.floor(labels.length / 2)];
  const odds = ui.drafts.odds && (labels.includes(ui.drafts.odds) || ui.drafts.odds === '%') ? ui.drafts.odds : (mid ?? '%');
  const kind = ui.drafts.fateKind || 'normal';
  const due = M.keyedDue();
  const opts = M.meaningOptions();
  const meaningSel = ui.drafts.meaningPick || s().defaultMeaning;

  return `
  ${due.length ? `<section class="card notice"><b>🔑 Keyed scene due:</b> ${due.map((k) => `${esc(k.name)}: ${esc(k.event || '')}`).join('<br>')}</section>` : ''}
  <section class="card">
    <div class="chaos">
      <span class="label">Chaos Factor<br><span class="muted small">${esc(M.VARIANTS[M.rules().variant])} · ${M.rules().method === 'check' ? 'Fate Check' : 'Fate Chart'}${M.rules().overridden ? ' (campaign)' : ''}</span></span>
      <button class="round" data-act="chaos" data-d="-1" aria-label="Lower chaos">−</button>
      <span class="big-number">${s().chaos}</span>
      <button class="round" data-act="chaos" data-d="1" aria-label="Raise chaos">＋</button>
    </div>
  </section>

  <section class="card">
    <h3>Fate question</h3>
    <div class="chip-row">
      ${[['normal', 'Question'], ['npc', 'NPC action'], ['discovery', 'Discovery']].map(([k, l]) =>
        `<button class="chip ${kind === k ? 'primary' : ''}" data-act="fateKind" data-kind="${k}">${l}</button>`).join('')}
    </div>
    <input type="text" placeholder="${kind === 'npc' ? 'Does the guard raise the alarm?' : kind === 'discovery' ? 'What is the character doing to find something?' : 'Is the door locked?'}"
      data-draft="fateQ" value="${esc(ui.drafts.fateQ || '')}" data-enter="ask">
    <div class="row">
      <select data-draft="odds" data-rerender>
        ${labels.map((l) => `<option ${l === odds ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        <option value="%" ${odds === '%' ? 'selected' : ''}>Custom %</option>
      </select>
      ${odds === '%' ? `<input type="number" min="1" max="99" class="narrow" data-draft="customPct" value="${esc(ui.drafts.customPct ?? 50)}">` : ''}
      <button class="primary" data-act="ask">Ask</button>
    </div>
    ${kind === 'discovery' ? `<p class="muted small">Discovery Checks need a Thread Progress Track, and odds can't be worse than 50/50.${s().noDiscovery ? ' <b>Dead end this scene.</b>' : ''}</p>` : ''}
  </section>

  <section class="card">
    <h3>Scenes <span class="muted small">· now on scene ${s().scene || '—'}</span></h3>
    <input type="text" placeholder="Expected scene" data-draft="sceneName" value="${esc(ui.drafts.sceneName || '')}" data-enter="testScene">
    <div class="row spread">
      <button class="primary" data-act="testScene">Test next scene</button>
      <button data-act="event">⚡ Random event</button>
    </div>
    <p class="muted small">End of scene bookkeeping: was the PC in control?</p>
    <div class="row spread">
      <button data-act="endScene" data-d="-1">In control (−1)</button>
      <button data-act="endScene" data-d="1">Out of control (+1)</button>
    </div>
  </section>

  <section class="card">
    <h3>Meaning</h3>
    ${opts.length ? `<div class="row">
      <select data-draft="meaningPick">${opts.map((o) =>
        `<option value="${esc(o.id)}" ${o.id === meaningSel ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
      <button class="primary" data-act="meaning">💡 Roll</button></div>`
      : '<p class="muted small">Pick your Actions, Descriptions and Elements tables in setup.</p>'}
  </section>`;
}

// ---------------------------------------------------------------
// RESULTS
// ---------------------------------------------------------------
function renderResult(res) {
  switch (res.type) {
    case 'fate': {
      const cls = res.answer.includes('Yes') ? 'yes' : 'no';
      const help = res.kind !== 'normal' ? M.INTERPRET[res.kind][res.answer] : '';
      return `
        ${res.question ? `<div class="muted">${esc(res.question)}</div>` : ''}
        <div class="answer ${cls}">${esc(res.answer)}</div>
        <div class="muted small">${esc(M.fateDetail(res))}</div>
        ${help ? `<p class="interp">${esc(help)}</p>` : ''}
        ${res.discovery ? renderDiscovery(res.discovery) : ''}
        ${res.event ? `${res.kind === 'npc' ? `<p class="interp">${esc(M.INTERPRET.npc.event)}</p>` : ''}${renderEvent(res.event)}` : ''}`;
    }
    case 'scene': {
      const note = { Expected: 'Play the scene as you expected.',
        Altered: 'Play the next most expected version of the scene.',
        Interrupt: 'A random event replaces the expected scene.' }[res.result];
      return `
        <div class="muted">Scene ${res.scene}${res.name ? `: ${esc(res.name)}` : ''}</div>
        <div class="answer">${esc(res.result)}</div>
        <div class="muted small">d10 ${res.roll} vs Chaos ${res.chaos}. ${esc(note)}</div>
        ${res.adjustments ? `<div class="event">${res.adjustments.map((a) => `<div>🔧 (${a.roll}) ${esc(a.text)}</div>`).join('')}</div>`
          : res.result === 'Altered' ? '<p class="muted small">Set a Scene Adjustment table in setup to get a suggestion.</p>' : ''}
        ${res.event ? renderEvent(res.event) : ''}
        ${res.keyedHits?.length ? `<p class="warn">🔑 Keyed scene due: ${res.keyedHits.map((k) => esc(k.name)).join(', ')}</p>` : ''}
        ${res.flashpoint ? `<p class="interp">⚑ Flashpoint from last scene happens now:</p>${renderEvent(res.flashpoint)}` : ''}`;
    }
    case 'event': return `<div class="answer">${esc(res.title || 'Random event')}</div>${renderEvent(res.event)}`;
    case 'meaning': return `<div class="muted">${esc(res.meaning.option)}</div>
      <div class="answer">${res.meaning.words.map((w) => esc(w.text)).join(' · ')}</div>
      <div class="muted small">${res.meaning.words.map((w) => w.roll).join(', ')}</div>`;
    case 'pick': return `<div class="muted">${esc(res.list)}</div><div class="answer">${esc(res.pick.choose ? 'Choose' : res.pick.item.text)}</div>
      ${res.pick.item?.npcId && getNpc(res.pick.item.npcId) ? `<button class="tbadge" data-act="openNpcCard" data-id="${res.pick.item.npcId}">👥 Open card</button>` : ''}
      <div class="muted small">${esc(M.listRollText(res.pick))}</div>`;
    case 'progress': return `<div class="answer">${esc(res.title)}</div>
      ${res.forced?.length ? `<p class="interp">Phase ended without a Flashpoint, so one is triggered${res.flashpoint ? '' : ' at the start of the next scene'}.</p>` : ''}
      ${res.flashpoint ? renderEvent(res.flashpoint) : ''}
      ${res.conclusion ? '<p class="interp">🏁 Conclusion! The thread reaches its climax. Once it\'s resolved you can remove it from the Threads list (button on the Thread tab). The track itself is kept under "Concluded".</p>' : ''}`;
    default: return '';
  }
}

function renderEvent(ev) {
  if (!ev.configured) return '<p class="warn">⚡ Random event! Set up the Event Focus and meaning tables to generate one.</p>';
  const f = ev.focus;
  return `<div class="event">
    ${f ? `<div><span class="muted small">⚡ Focus${f.roll != null ? ` (${f.roll})` : ''}</span><br>${esc(f.text)}
      ${f.pick ? `<br><span class="muted small">↳ ${esc(M.listRollText(f.pick))}</span>${f.pick.item?.npcId && getNpc(f.pick.item.npcId) ? ` <button class="tbadge" data-act="openNpcCard" data-id="${f.pick.item.npcId}">👥 Open card</button>` : ''}` : ''}
      ${f.note ? `<br><span class="muted small">↳ ${esc(f.note)}</span>` : ''}</div>` : ''}
    ${ev.meaning ? `<div><span class="muted small">💡 ${esc(ev.meaning.option)}</span><br>${ev.meaning.words.map((w) => esc(w.text)).join(' · ')}</div>` : ''}
  </div>`;
}

function renderDiscovery(list) {
  return `<div class="event">${list.map((d) => `<div><span class="muted small">🔎 d10 ${d.d10} + ${d.points} = ${d.total}</span><br>${esc(d.text)}
    ${d.meaning ? `<br><span class="muted small">💡 ${esc(M.meaningText(d.meaning))}</span>` : ''}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------
// LISTS
// ---------------------------------------------------------------
function renderLists() {
  return renderList('mythic-threads', 'Threads', 'New thread') + renderList('mythic-characters', 'Characters', 'New character / NPC');
}

/** Small progress bar shown next to a thread that has a track. */
function trackBadge(text) {
  const t = M.trackFor(text);
  if (!t) return '';
  const pct = Math.round((t.points / t.length) * 100);
  const state = t.done ? ' ✓' : t.paused ? ' ⏸' : '';
  return `<button class="tbadge" data-act="openTrack" data-id="${t.id}" title="Open this track">
    <span class="tbar"><span style="width:${pct}%"></span></span>${t.points}/${t.length}${state}</button>`;
}

function renderList(id, name, placeholder) {
  const list = M.getList(id);
  const key = `add-${id}`;
  return `
  <section class="card">
    <div class="row spread"><h3>${esc(name)} <span class="muted">(${list.items.length}/25)</span></h3>
      <button data-act="pick" data-list="${id}" ${list.items.length ? '' : 'disabled'}>🎲 Roll</button></div>
    <ol class="list mythic-list">${list.items.map((it, i) => `
      <li class="${i % 5 === 4 ? 'section-end' : ''}"><span class="lnum">${i + 1}</span><span>${esc(it.text)}${id === 'mythic-threads' ? trackBadge(it.text) : ''}${it.npcId && getNpc(it.npcId) ? ` <button class="tbadge" data-act="openNpcCard" data-id="${it.npcId}" title="Open NPC card">👥 ${esc(attitudeName(getNpc(it.npcId).attitude))}</button>` : ''}</span>
        <button class="icon-btn" data-act="mv" data-list="${id}" data-item="${it.id}" data-d="-1" aria-label="Move up">↑</button>
        <button class="icon-btn" data-act="dup" data-list="${id}" data-text="${esc(it.text)}" title="Add again (more weight)">＋</button>
        <button class="icon-btn" data-act="rmItem" data-list="${id}" data-item="${it.id}" aria-label="Remove">✕</button></li>`).join('')}
    </ol>
    <div class="row"><input type="text" placeholder="${esc(placeholder)}" data-draft="${key}" value="${esc(ui.drafts[key] || '')}" data-enter="addItem" data-list="${id}">
      <button data-act="addItem" data-list="${id}">Add</button></div>
    <p class="muted small">5 sections of 5 lines. Rolls pick a section, then a line. An empty line means "Choose". Adding an entry again gives it more weight.</p>
  </section>`;
}

// ---------------------------------------------------------------
// THREAD PROGRESS TRACK
// ---------------------------------------------------------------
function renderThread() {
  const tracks = s().tracks;
  const active = M.activeTrack();
  const threads = M.getList('mythic-threads').items;
  // Unique thread names from the list that don't have a track yet.
  const untracked = [...new Set(threads.map((i) => i.text))].filter((name) => !M.trackFor(name));
  const pick = ui.drafts.trackPick ?? (untracked[0] ?? '__other');

  const g = M.trackGroups();
  const chip = (t) => `<button class="chip ${active?.id === t.id ? 'primary' : ''}" data-act="switchTrack" data-id="${t.id}">
      ${esc(t.thread)} · ${t.points}/${t.length}${t.done ? ' ✓' : ''}${t.pendingFlashpoint ? ' ⚑' : ''}</button>`;
  const switcher = tracks.length ? `<section class="card">
    <h3>Your tracks</h3>
    ${g.open.length ? `<div class="chip-row">${g.open.map(chip).join('')}</div>` : '<p class="muted small">No open tracks.</p>'}
    ${g.paused.length ? `<details class="help"><summary>Minimized (${g.paused.length})</summary><div class="chip-row">${g.paused.map(chip).join('')}</div></details>` : ''}
    ${g.done.length ? `<details class="help"><summary>Concluded (${g.done.length})</summary><div class="chip-row">${g.done.map(chip).join('')}</div></details>` : ''}
    <p class="muted small">Each thread keeps its own progress. The highlighted one is the one you're working on (Discovery Checks use it). Tap a minimized or concluded track to open it.</p>
  </section>` : '';

  const starter = `<section class="card">
    <h3>${tracks.length ? 'Start another track' : 'Thread Progress Track'}</h3>
    ${tracks.length ? '' : '<p class="muted small">Pick a thread to drive toward a conclusion. Progress and Flashpoints earn 2 points. Every 5 points is a phase, and each phase needs a Flashpoint. Tracks are optional; your Threads list works without them.</p>'}
    <select data-draft="trackPick" data-rerender>
      ${untracked.map((name) => `<option value="${esc(name)}" ${pick === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}
      <option value="__other" ${pick === '__other' ? 'selected' : ''}>Other (type a name)…</option>
    </select>
    ${pick === '__other' ? `<input type="text" placeholder="Thread name" data-draft="trackThread" value="${esc(ui.drafts.trackThread || '')}">` : ''}
    ${!untracked.length && !threads.length ? '<p class="muted small">Tip: add threads on the Lists tab and they show up here.</p>' : ''}
    <div class="row spread">${[10, 15, 20].map((n) => `<button data-act="startTrack" data-len="${n}">${n} points</button>`).join('')}</div>
  </section>`;

  if (!active) return switcher + starter;

  const t = active;
  const boxes = Array.from({ length: t.length }, (_, i) =>
    `<span class="pbox ${i < t.points ? 'on' : ''} ${i % 5 === 4 ? 'phase-end' : ''}">${i + 1}</span>`).join('');
  return switcher + `<section class="card">
    <h3>${esc(t.thread)}</h3>
    <div class="ptrack">${boxes}</div>
    <p class="muted small">${t.points}/${t.length} points · Flashpoints: ${t.flash.map((f, i) => `phase ${i + 1} ${f ? '✓' : '☐'}`).join(', ')}
      ${t.pendingFlashpoint ? ' · <b>Flashpoint due at the start of the next scene</b>' : ''}${t.done ? ' · <b>Concluded</b>' : ''}</p>
    <div class="row spread">
      <button class="primary" data-act="progress" data-kind="progress" ${t.done ? 'disabled' : ''}>Progress +2</button>
      <button data-act="progress" data-kind="flashpoint" ${t.done ? 'disabled' : ''}>Flashpoint +2</button>
    </div>
    <div class="row spread">
      <button data-act="progress" data-kind="adjust" data-pts="1">+1</button>
      <button data-act="progress" data-kind="adjust" data-pts="-1">−1</button>
      <label class="toggle small"><input type="checkbox" data-act="bookkeeping" ${ui.drafts.bookkeeping ? 'checked' : ''}> Bookkeeping (Flashpoint next scene)</label>
    </div>
    <p class="muted small">Stuck? Ask a <b>Discovery</b> question on the Play tab.</p>
    ${t.done && M.getList('mythic-threads').items.some((i) => i.text.toLowerCase() === t.thread.toLowerCase())
      ? '<button class="wide" data-act="removeThread">Remove this thread from the Threads list</button>' : ''}
    <div class="row spread">
      <button data-act="pauseTrack">▾ ${t.done ? 'Put away' : 'Minimize'}</button>
      <button class="danger" data-act="clearTrack">Delete track</button>
    </div>
  </section>` + starter;
}

// ---------------------------------------------------------------
// KEYED SCENES
// ---------------------------------------------------------------
function renderKeyed() {
  return `
  ${s().keyed.map((k) => `
  <section class="card ${k.target && k.count >= k.target ? 'notice' : ''}">
    <div class="row spread"><h3>🔑 ${esc(k.name)}</h3><button class="icon-btn" data-act="rmKeyed" data-id="${k.id}" aria-label="Delete">✕</button></div>
    <p class="small"><b>Trigger:</b> ${esc(k.trigger || '—')}<br><b>Event:</b> ${esc(k.event || '—')}</p>
    <div class="counter"><span class="cname">${k.count}${k.target ? ` / ${k.target}` : ''} ${k.auto ? '<span class="muted small">(counts each scene)</span>' : ''}</span>
      <button class="round" data-act="bumpKeyed" data-id="${k.id}" data-d="-1">−</button>
      <button class="round" data-act="bumpKeyed" data-id="${k.id}" data-d="1">＋</button>
      <button data-act="resetKeyed" data-id="${k.id}">Done / reset</button></div>
  </section>`).join('')}
  <section class="card">
    <h3>New keyed scene</h3>
    <p class="muted small">Your own rule: when the counter reaches the target, the event is due in the next scene.</p>
    <input type="text" placeholder="Name (e.g. Let's rumble)" data-draft="kName" value="${esc(ui.drafts.kName || '')}">
    <input type="text" placeholder="Trigger (e.g. 2 scenes in a row without a fight)" data-draft="kTrigger" value="${esc(ui.drafts.kTrigger || '')}">
    <input type="text" placeholder="Event (e.g. a fight breaks out: random event, focus Current Context)" data-draft="kEvent" value="${esc(ui.drafts.kEvent || '')}">
    <div class="row"><input type="number" class="narrow" placeholder="Target" data-draft="kTarget" value="${esc(ui.drafts.kTarget ?? '')}">
      <label class="toggle"><input type="checkbox" data-act="kAuto" ${ui.drafts.kAuto === false ? '' : 'checked'}> Count every scene</label>
      <button class="primary" data-act="addKeyed">Add</button></div>
  </section>`;
}

// ---------------------------------------------------------------
// SETUP SHEET
// ---------------------------------------------------------------
function openSetup() {
  const st = s();
  const v = ui.drafts.setupVariant || st.variant;
  const tableOpts = (sel) => '<option value="">— none —</option>' + visibleTables()
    .slice().sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name))
    .map((t) => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.folder)} › ${esc(t.name)}</option>`).join('');

  const el = sheet('Mythic setup', `
    <p class="muted small">Tables come from your copy of the book. The quickest way in is <b>Tables → Bulk paste</b>, using a <code>#&nbsp;Name</code> line before each table and a folder such as "Mythic". Then pick them below.</p>

    <h3>Rules <span class="muted small">(all campaigns)</span></h3>
    ${M.rules().overridden ? '<p class="warn small">This campaign overrides these rules. Change that in the campaign menu (top bar).</p>' : ''}
    <label>Answer fate questions with
      <select id="su-method">
        <option value="check" ${st.method === 'check' ? 'selected' : ''}>Fate Check (2d10 + modifiers)</option>
        <option value="chart" ${st.method === 'chart' ? 'selected' : ''}>Fate Chart (d100)</option>
      </select></label>
    <label>Chaos variant in play
      <select id="su-variant">${Object.entries(M.VARIANTS).map(([k, l]) => `<option value="${k}" ${st.variant === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>

    <h3>Odds data <span class="muted small">(one set per variant)</span></h3>
    <label>Editing variant
      <select id="su-edit-variant">${Object.entries(M.VARIANTS).map(([k, l]) =>
        `<option value="${k}" ${v === k ? 'selected' : ''}>${l} ${st.checkMods[k] ? '· check ✓' : ''} ${st.charts[k] ? '· chart ✓' : ''}</option>`).join('')}</select></label>
    <label>Fate Check modifiers: one per line, odds first, then Chaos
      <textarea rows="8" id="su-mods" spellcheck="false" placeholder="Certain: +N\n…\nImpossible: −N\nCF 9: +N\n…\nCF 1: −N">${esc(M.checkModsToText(st.checkMods[v]))}</textarea></label>
    <label>Fate Chart (optional): a label, then 9 chances (Chaos 1→9) or 27 numbers as exYes/chance/exNo. Repeat a value where your book groups Chaos levels.
      <textarea rows="6" id="su-chart" spellcheck="false">${esc(M.chartToText(st.charts[v]))}</textarea></label>
    <button data-setup="saveOdds">Save odds for this variant</button>

    <h3>Tables</h3>
    <label>Random Event Focus <select id="su-focus">${tableOpts(st.focusTable)}</select></label>
    <label>Actions (table 1, table 2)
      <select id="su-a1">${tableOpts(st.actionTables[0])}</select><select id="su-a2">${tableOpts(st.actionTables[1])}</select></label>
    <label>Descriptions (table 1, table 2)
      <select id="su-d1">${tableOpts(st.descriptionTables[0])}</select><select id="su-d2">${tableOpts(st.descriptionTables[1])}</select></label>
    <label>Elements folder: every table in it (and its sub-folders) shows up as an Elements option
      <select id="su-elements"><option value="">— none —</option>${folderPaths().map((f) => `<option ${st.elementsFolder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    <label>Scene Adjustment <select id="su-adjust">${tableOpts(st.sceneAdjustTable)}</select></label>
    <label>Thread Discovery Check <select id="su-discovery">${tableOpts(st.discoveryTable)}</select></label>
    <label>Default meaning for random events
      <select id="su-defmeaning">${M.meaningOptions().map((o) => `<option value="${esc(o.id)}" ${st.defaultMeaning === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('') || '<option value="actions">Actions</option>'}</select></label>
    <button class="primary wide" data-setup="saveAll">Save setup</button>
  `);

  el.addEventListener('change', (e) => {
    if (e.target.id === 'su-edit-variant') { ui.drafts.setupVariant = e.target.value; openSetup(); }
  });
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-setup]')?.dataset.setup;
    if (act === 'saveOdds') {
      try {
        const modsText = el.querySelector('#su-mods').value.trim();
        const chartText = el.querySelector('#su-chart').value.trim();
        st.checkMods[v] = modsText ? M.parseCheckMods(modsText) : null;
        st.charts[v] = chartText ? M.parseChart(chartText) : null;
        save('mythic'); emit();
        toast(`Saved ${M.VARIANTS[v]} odds`);
        openSetup();
      } catch (err) { toast(err.message); }
    }
    if (act === 'saveAll') {
      const val = (id) => el.querySelector(id).value;
      st.method = val('#su-method');
      st.variant = val('#su-variant');
      st.focusTable = val('#su-focus');
      st.actionTables = [val('#su-a1'), val('#su-a2')].filter(Boolean);
      st.descriptionTables = [val('#su-d1'), val('#su-d2')].filter(Boolean);
      st.elementsFolder = val('#su-elements');
      st.sceneAdjustTable = val('#su-adjust');
      st.discoveryTable = val('#su-discovery');
      st.defaultMeaning = val('#su-defmeaning');
      ui.drafts.odds = undefined;
      save('mythic'); emit(); closeSheet(); toast('Setup saved');
    }
  });
}

// ---------------------------------------------------------------
// ACTIONS
// ---------------------------------------------------------------
function show(result) { ui.results.mythic = result; }

export const actions = {
  sub: (el) => { ui.drafts.mythicSub = el.dataset.sub; emit(); },
  openNpcCard: (el) => { ui.tab = 'npcs'; ui.drafts.npcOpen = el.dataset.id; ui.drafts.npcTalk = false; emit(); },
  setup: () => openSetup(),
  chaos: (el) => M.setChaos(s().chaos + +el.dataset.d),
  fateKind: (el) => { ui.drafts.fateKind = el.dataset.kind; emit(); },

  ask: () => {
    const kind = ui.drafts.fateKind || 'normal';
    if (kind === 'discovery') {
      if (!M.activeTrack()) return toast('Start a Thread Progress Track first (Thread tab)');
      if (s().noDiscovery) return toast('Dead end: no more Discovery Checks this scene');
    }
    const labels = M.oddsLabels();
    const mid = labels.find((l) => /50/.test(l)) || labels[Math.floor(labels.length / 2)];
    let odds = ui.drafts.odds && (labels.includes(ui.drafts.odds) || ui.drafts.odds === '%') ? ui.drafts.odds : (mid ?? '%');
    // Discovery odds can't be worse than 50/50.
    if (kind === 'discovery' && odds !== '%' && labels.indexOf(odds) > labels.indexOf(mid) && /50/.test(mid || '')) {
      // Labels are listed best-first in most pastes; if the chosen one sits after 50/50, use 50/50.
      odds = mid;
    }
    const pct = Math.max(1, Math.min(99, parseInt(ui.drafts.customPct ?? 50, 10) || 50));
    const r = M.askFate(odds === '%' ? null : odds, kind === 'discovery' ? Math.max(pct, 50) : pct);
    const question = (ui.drafts.fateQ || '').trim();
    const res = { type: 'fate', kind, question, ...r };

    let extra = '';
    if (kind === 'discovery') {
      const rolls = r.answer === 'Exceptional Yes' ? 2 : r.answer === 'Yes' ? 1 : 0;
      if (r.answer === 'Exceptional No') { s().noDiscovery = true; save('mythic'); }
      if (rolls && !visibleTables().find((t) => t.id === s().discoveryTable)) toast('Set a Thread Discovery Check table in setup');
      res.discovery = [];
      for (let i = 0; i < rolls; i++) {
        const d = M.discoveryRoll();
        if (!d) break;
        res.discovery.push(d);
        const pts = M.discoveryPoints(d.text);
        if (pts) {
          const p = M.addProgress(pts, /flashpoint/i.test(d.text) ? 'flashpoint' : 'progress', true);
          if (p?.flashpoint) res.event = p.flashpoint;
        }
      }
      extra = res.discovery.map((d) => `\nDiscovery (d10 ${d.d10} + ${d.points} = ${d.total}): ${d.text}\n${M.meaningText(d.meaning)}`).join('');
    }
    show(res);
    ui.drafts.fateQ = '';
    const label = kind === 'npc' ? 'NPC: ' : kind === 'discovery' ? 'Discovery: ' : '';
    let body = M.fateDetail(r);
    if (kind !== 'normal') body += `\n${M.INTERPRET[kind][r.answer]}`;
    body += extra;
    if (res.event) body += `\n**Random event**\n${M.eventText(res.event)}`;
    addLog('mythic', `${label}${question ? question + ' ' : ''}**${r.answer}**`, body);
  },

  testScene: () => {
    const name = (ui.drafts.sceneName || '').trim();
    const r = M.testScene();
    show({ type: 'scene', name, ...r });
    ui.drafts.sceneName = '';
    addLog('scene', `Scene ${r.scene}${name ? `: ${name}` : ''}`);
    let body = `d10 ${r.roll} vs Chaos ${r.chaos}`;
    if (r.adjustments) body += '\n' + r.adjustments.map((a) => `Adjustment (${a.roll}): ${a.text}`).join('\n');
    if (r.event) body += `\n${M.eventText(r.event)}`;
    if (r.keyedHits.length) body += `\nKeyed scene due: ${r.keyedHits.map((k) => k.name).join(', ')}`;
    if (r.flashpoint) body += `\nFlashpoint: ${M.eventText(r.flashpoint)}`;
    addLog('mythic', `Scene test: **${r.result}**`, body);
  },

  endScene: (el) => {
    const { before, after } = M.endScene(+el.dataset.d);
    toast(after === before ? `Chaos stays at ${after}` : `Chaos ${before} → ${after}`);
    addLog('mythic', `End of scene ${s().scene || ''}: Chaos ${before} → ${after}`);
  },

  event: () => {
    const ev = M.randomEvent();
    show({ type: 'event', event: ev });
    addLog('mythic', 'Random event', M.eventText(ev));
  },

  meaning: () => {
    const mn = M.rollMeaning(ui.drafts.meaningPick || s().defaultMeaning);
    if (!mn) return toast('Set up meaning tables first');
    show({ type: 'meaning', meaning: mn });
    addLog('mythic', `Meaning (${mn.option}): ${mn.words.map((w) => w.text).join(' + ')}`);
  },

  // ----- lists -----
  pick: (el) => {
    const r = M.rollList(el.dataset.list);
    show({ type: 'pick', list: r.list, pick: r });
    addLog('mythic', `${r.list} roll: ${r.choose ? 'Choose' : r.item.text}`, M.listRollText(r));
  },
  addItem: (el) => {
    const key = `add-${el.dataset.list}`;
    if (M.getList(el.dataset.list).items.length >= 25) return toast('Lists hold 25 lines');
    M.addListItem(el.dataset.list, ui.drafts[key] || '');
    if (el.dataset.list === 'mythic-characters') syncCharacters(); // every character gets an NPC card
    ui.drafts[key] = ''; emit();
  },
  dup: (el) => {
    if (M.getList(el.dataset.list).items.length >= 25) return toast('Lists hold 25 lines');
    const src = M.getList(el.dataset.list).items.find((i) => i.text === el.dataset.text);
    M.addListItem(el.dataset.list, el.dataset.text);
    // a duplicate of a linked character points at the same NPC card
    const items = M.getList(el.dataset.list).items;
    if (src?.npcId) items[items.length - 1].npcId = src.npcId;
  },
  mv: (el) => M.moveListItem(el.dataset.list, el.dataset.item, +el.dataset.d),
  rmItem: (el) => M.removeListItem(el.dataset.list, el.dataset.item),

  // ----- thread track -----
  startTrack: (el) => {
    const threads = M.getList('mythic-threads').items;
    const untracked = [...new Set(threads.map((i) => i.text))].filter((name) => !M.trackFor(name));
    const pick = ui.drafts.trackPick ?? (untracked[0] ?? '__other');
    const thread = (pick === '__other' ? ui.drafts.trackThread || '' : pick).trim();
    if (!thread) return toast('Name the thread');
    M.startTrack(thread, +el.dataset.len);
    ui.drafts.trackPick = undefined; ui.drafts.trackThread = '';
    addLog('mythic', `Thread Progress Track started: ${thread} (${el.dataset.len})`);
  },
  switchTrack: (el) => M.switchTrack(el.dataset.id),
  openTrack: (el) => { M.switchTrack(el.dataset.id); ui.drafts.mythicSub = 'thread'; emit(); },
  pauseTrack: () => { const t = M.activeTrack(); if (t) { M.pauseTrack(t.id); toast(`${t.thread} minimized`); } },
  removeThread: async () => {
    const t = M.activeTrack();
    if (!t || !(await askConfirm(`Remove "${t.thread}" from the Threads list? The concluded track stays.`, 'Remove'))) return;
    const list = M.getList('mythic-threads');
    list.items.filter((i) => i.text.toLowerCase() === t.thread.toLowerCase()).forEach((i) => M.removeListItem('mythic-threads', i.id));
    addLog('mythic', `Thread closed: ${t.thread}`);
  },
  progress: (el) => {
    const kind = el.dataset.kind;
    const pts = kind === 'adjust' ? +el.dataset.pts : 2;
    const r = M.addProgress(pts, kind, !ui.drafts.bookkeeping);
    if (!r) return;
    const t = M.activeTrack();
    const title = kind === 'flashpoint' ? 'Flashpoint +2' : kind === 'progress' ? 'Progress +2' : `${pts > 0 ? '+' : ''}${pts}`;
    show({ type: 'progress', title: `${title} → ${t.points}/${t.length}`, ...r });
    let body = '';
    if (r.forced.length) body += `Phase ${r.forced.join(', ')} ended without a Flashpoint: one is triggered${r.flashpoint ? '' : ' next scene'}.`;
    if (r.flashpoint) body += `\n${M.eventText(r.flashpoint)}`;
    if (r.conclusion) body += '\nConclusion reached!';
    addLog('mythic', `${t.thread}: ${title} (${t.points}/${t.length})`, body.trim());
  },
  bookkeeping: (el) => { ui.drafts.bookkeeping = el.checked; },
  clearTrack: async () => {
    const t = M.activeTrack();
    if (!t || !(await askConfirm(`Delete the track for "${t.thread}"? Its progress is lost.`, 'Delete'))) return;
    M.removeTrack(t.id);
  },

  // ----- keyed scenes -----
  kAuto: (el) => { ui.drafts.kAuto = el.checked; },
  addKeyed: () => {
    const name = (ui.drafts.kName || '').trim();
    if (!name) return toast('Name the keyed scene');
    M.addKeyed({ name, trigger: (ui.drafts.kTrigger || '').trim(), event: (ui.drafts.kEvent || '').trim(),
      target: parseInt(ui.drafts.kTarget, 10) || 0, auto: ui.drafts.kAuto !== false });
    ui.drafts.kName = ui.drafts.kTrigger = ui.drafts.kEvent = ui.drafts.kTarget = '';
  },
  bumpKeyed: (el) => M.bumpKeyed(el.dataset.id, +el.dataset.d),
  resetKeyed: (el) => {
    const k = s().keyed.find((x) => x.id === el.dataset.id);
    M.resetKeyed(el.dataset.id);
    addLog('mythic', `Keyed scene resolved: ${k.name}`);
  },
  rmKeyed: async (el) => {
    if (!(await askConfirm('Delete this keyed scene?', 'Delete'))) return;
    M.removeKeyed(el.dataset.id);
  },
};
