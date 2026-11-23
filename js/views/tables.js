// =============================================================
// views/tables.js — browse, roll, edit and import random tables
// =============================================================

import { state, ui, emit, activeCampaign } from '../state.js';
import {
  rollTable, getTable, saveTable, deleteTable, newTable, folders, folderPaths, renameFolder, visibleTables,
  parseEntries, parseBulk, entriesToText, checkTable, dieSize, exportPack, importPack,
  parseFor, textFor, looksLikeCards, rankLabel, applyText, columnTable,
} from '../tables.js';
import { addLog } from '../log.js';
import { esc, toast, sheet, closeSheet, saveJSON, openJSON, askConfirm, askText } from '../ui.js';

export const title = 'Tables';

export function render() {
  if (ui.drafts.editing) return renderEditor();
  const q = (ui.drafts.tableSearch || '').toLowerCase();
  const res = ui.results.tables;
  const list = visibleTables().filter((t) =>
    !q || t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q));
  const open = ui.drafts.openFolders || {};

  return `
  ${res?.grid ? `<section class="card result-card">
      <div class="muted">${esc(res.folder)} › ${esc(res.name)} · grid: which column?</div>
      <div class="chip-row">${res.columns.map((c) => `<button class="chip" data-act="rollCol" data-id="${res.id}" data-col="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </section>` : res ? `<section class="card result-card">
      <div class="muted">${esc(res.folder)} › ${esc(res.name)} · ${res.card !== undefined ? 'card' : `d${res.size}`} → <b>${esc(String(res.shown ?? res.roll))}</b></div>
      <div class="result-text">${esc(res.text)}</div>
      ${res.steps.length ? `<div class="muted small">${res.steps.map(esc).join(' · ')}</div>` : ''}
      <div class="row"><button data-act="${res.col ? 'rollCol' : 'roll'}" data-id="${res.id}" ${res.col ? `data-col="${esc(res.col)}"` : ''}>↻ Reroll</button>
        ${res.columns ? res.columns.filter((c) => c !== res.col).map((c) => `<button class="chip" data-act="rollCol" data-id="${res.id}" data-col="${esc(c)}">${esc(c)}</button>`).join('') : ''}</div>
    </section>` : ''}
  <section class="card">
    <div class="row">
      <input type="search" placeholder="Search tables" data-draft="tableSearch" data-rerender value="${esc(ui.drafts.tableSearch || '')}">
      <button class="primary" data-act="new">＋ New</button>
    </div>
    ${!visibleTables().length ? `<p class="muted">No tables yet. Tap <b>＋ New</b> and paste a table from a book (formats like <code>01-05 Text</code> work), or import a pack.</p>` : ''}
    ${renderTree(list, q, open)}
  </section>
  <section class="card">
    <h3>Packs</h3>
    <p class="muted small">A pack is a folder of tables saved as one file, for backups or moving tables between devices. Use ⇪ next to a folder to export it.</p>
    <div class="row spread">
      <button data-act="bulk">⧉ Bulk paste tables</button>
      <button data-act="importPack">⇩ Import pack (.json)</button>
    </div>
    <details class="help"><summary>Table syntax</summary>
      <p><code>[[Other Table]]</code> rolls another table inside an entry. <code>[[Folder/Table]]</code> if names clash.
      <code>{2d6}</code> rolls dice inline. A one-entry table like <code>[[Name]] the [[Job]]</code> works as a generator.</p>
    </details>
  </section>`;
}

// ---------------------------------------------------------------
// Folder tree. Folder names can contain "/" for sub-folders, e.g.
// "Mythic/Elements". Parent folders show even if they hold no
// tables directly. Closing a folder hides everything inside it.
// ---------------------------------------------------------------
function renderTree(list, q, open) {
  const paths = folderPaths();
  const isOpen = (p) => q || open[p] !== false;
  return paths.map((path) => {
    const parts = path.split('/');
    // Hidden if any ancestor is closed.
    for (let i = 1; i < parts.length; i++) {
      if (!isOpen(parts.slice(0, i).join('/'))) return '';
    }
    const inside = list.filter((t) => t.folder === path || t.folder.startsWith(path + '/'));
    if (!inside.length) return '';
    const direct = list.filter((t) => t.folder === path).sort((a, b) => a.name.localeCompare(b.name));
    const depth = parts.length - 1;
    return `
      <div class="folder" style="margin-left:${depth * 14}px">
        <div class="folder-head">
          <button class="folder-toggle" data-act="toggleFolder" data-folder="${esc(path)}">${isOpen(path) ? '▾' : '▸'} ${esc(parts[parts.length - 1])} <span class="muted">(${inside.length})</span></button>
          <button class="icon-btn" data-act="renameFolder" data-folder="${esc(path)}" title="Rename / move folder">✎</button>
          <button class="icon-btn" data-act="exportPack" data-folder="${esc(path)}" title="Export this folder (and sub-folders) as a pack">⇪</button>
        </div>
        ${isOpen(path) ? direct.map((t) => `
          <div class="table-row">
            <button class="table-roll" data-act="roll" data-id="${t.id}">🎲 ${esc(t.name)} <span class="muted small">${t.die === 'card' ? '🂠 card' : `d${dieSize(t)}`}${t.columns ? ` · ▦ ${t.columns.length} columns` : ''}${t.campaign ? ' · this campaign' : ''}</span></button>
            <button class="icon-btn" data-act="edit" data-id="${t.id}" aria-label="Edit">✎</button>
          </div>`).join('') : ''}
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------
// Editor
// ---------------------------------------------------------------
function renderEditor() {
  const t = ui.drafts.editing; // a working copy, saved on "Save"
  const text = ui.drafts.editText ?? textFor(t);
  const preview = applyText({ ...t }, text);
  const check = checkTable(preview);
  const warn = [];
  if (check.gaps.length) warn.push(`No entry for: ${summarize(check.gaps)}`);
  if (check.overlaps.length) warn.push(`Overlapping numbers: ${summarize(check.overlaps)}`);
  if (check.tooBig) warn.push(`${check.tooBig} entr${check.tooBig === 1 ? 'y goes' : 'ies go'} past d${check.size}`);

  return `
  <section class="card">
    <h3>${state.tables.some((x) => x.id === t.id) ? 'Edit table' : 'New table'}</h3>
    <label>Name<input type="text" data-edit="name" value="${esc(t.name)}"></label>
    ${folderPicker('edit', t.folder)}
    ${scopePicker('editScope', t.campaign)}
    <label>Die
      <select data-edit="die" data-rerender>
        ${['auto', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd30', 'd100', 'card'].map((d) =>
          `<option value="${d}" ${t.die === d ? 'selected' : ''}>${d === 'auto' ? `Auto (d${dieSize(preview)})` : d === 'card' ? 'Playing card (A–K, draws from the deck)' : d}</option>`).join('')}
      </select>
    </label>
    <label>Entries <span class="muted small">${t.die === 'card'
      ? 'one per card: <code>A …</code>, <code>2 …</code>, <code>J-K …</code>, <code>Joker …</code>'
      : 'one per line, e.g. <code>1-3 A wolf</code> or just plain lines'}.
      For a <b>grid</b> (one roll, several columns), start each column with <code>## Name</code>.</span>
      <textarea rows="12" data-draft="editText" data-rerender-blur spellcheck="false">${esc(text)}</textarea>
    </label>
    <p class="muted small">${preview.columns ? `Grid: ${preview.columns.map((c) => `${esc(c.name)} (${c.entries.length})`).join(', ')}` : `${preview.entries.length} entries`} · ${t.die === 'card' ? 'draws a playing card' : `rolls d${check.size}`}</p>
    ${t.die !== 'card' && looksLikeCards(text) ? '<p class="warn">These entries look card-keyed (A, J, Q, K). Set Die to <b>Playing card</b>.</p>' : ''}
    ${warn.length ? `<p class="warn">⚠︎ ${warn.map(esc).join('<br>⚠︎ ')}</p>` : ''}
    <label>Notes<textarea rows="2" data-edit="notes">${esc(t.notes || '')}</textarea></label>
    <div class="row spread">
      <button class="primary" data-act="saveEdit">Save</button>
      <button data-act="testEdit">🎲 Test roll</button>
      <button data-act="cancelEdit">Cancel</button>
    </div>
    ${state.tables.some((x) => x.id === t.id) ? '<button class="danger wide" data-act="deleteTable">Delete table</button>' : ''}
  </section>`;
}

/**
 * Folder dropdown: existing folders (including sub-folders) plus
 * "New folder…", which shows a box to type the new name in.
 * Drafts: `${prefix}FolderPick` (selected value), `${prefix}NewFolder`.
 */
function folderPicker(prefix, current) {
  const paths = folderPaths();
  const pickKey = `${prefix}FolderPick`, newKey = `${prefix}NewFolder`;
  if (ui.drafts[pickKey] === undefined) {
    ui.drafts[pickKey] = paths.includes(current) ? current : '__new';
    if (!paths.includes(current)) ui.drafts[newKey] = current || '';
  }
  const pick = ui.drafts[pickKey];
  return `<label>Folder / pack
    <select data-draft="${pickKey}" data-rerender>
      ${paths.map((f) => `<option value="${esc(f)}" ${pick === f ? 'selected' : ''}>${esc(f.split('/').map((p, i, a) => (i < a.length - 1 ? '\u00a0\u00a0' : p)).join(''))}</option>`).join('')}
      <option value="__new" ${pick === '__new' ? 'selected' : ''}>＋ New folder…</option>
    </select>
    ${pick === '__new' ? `<input type="text" placeholder="Folder name (use / for a sub-folder, e.g. Mythic/Elements)" data-draft="${newKey}" value="${esc(ui.drafts[newKey] || '')}">` : ''}
  </label>`;
}

/** The folder the picker currently points at. */
function pickedFolder(prefix, fallback) {
  const pick = ui.drafts[`${prefix}FolderPick`];
  const name = pick === '__new' ? (ui.drafts[`${prefix}NewFolder`] || '') : pick;
  return (name || '').split('/').map((p) => p.trim()).filter(Boolean).join('/') || fallback;
}

/** "All campaigns" vs "This campaign only". */
function scopePicker(key, currentCampaign) {
  if (ui.drafts[key] === undefined) ui.drafts[key] = currentCampaign ? 'campaign' : 'global';
  const c = activeCampaign();
  return `<label>Available in
    <select data-draft="${key}">
      <option value="global" ${ui.drafts[key] === 'global' ? 'selected' : ''}>All campaigns (library)</option>
      <option value="campaign" ${ui.drafts[key] === 'campaign' ? 'selected' : ''}>Only this campaign (${esc(c?.name || '')})</option>
    </select></label>`;
}
const scopeValue = (key) => (ui.drafts[key] === 'campaign' ? activeCampaign()?.id || null : null);

function clearEditDrafts() {
  for (const k of ['editing', 'editText', 'editFolderPick', 'editNewFolder', 'editScope']) ui.drafts[k] = undefined;
}

/** [1,2,3,7,9,10] → "1–3, 7, 9–10" (first few only). */
function summarize(nums) {
  const runs = [];
  for (const n of nums) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  const s = runs.slice(0, 6).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
  return runs.length > 6 ? s + '…' : s;
}

/** Read the editor's fields into the working copy. */
function collectEdit() {
  const t = ui.drafts.editing;
  document.querySelectorAll('[data-edit]').forEach((el) => { t[el.dataset.edit] = el.value; });
  t.name = t.name.trim() || 'Untitled';
  t.folder = pickedFolder('edit', 'My Tables');
  t.campaign = scopeValue('editScope');
  applyText(t, ui.drafts.editText ?? textFor(t));
  return t;
}

function doRoll(t, col) {
  // A grid table asks which column first (then remembers it for rerolls).
  if (t.columns && !col) {
    ui.results.tables = { id: t.id, name: t.name, folder: t.folder, grid: true, columns: t.columns.map((c) => c.name) };
    emit(); // (nothing is logged yet, so redraw by hand)
    return;
  }
  const tt = col ? columnTable(t, col) : t;
  const r = rollTable(tt);
  ui.results.tables = { id: t.id, name: tt.name, folder: t.folder, size: r.size, roll: r.roll, shown: r.shown,
    card: t.die === 'card' ? r.card : undefined, text: r.text, steps: r.steps,
    col, columns: t.columns?.map((c) => c.name) };
  addLog('table', `${tt.name} (${r.shown}): ${r.text}`);
}

export const actions = {
  roll: (el) => { const t = getTable(el.dataset.id); if (t) doRoll(t); },
  rollCol: (el) => { const t = getTable(el.dataset.id); if (t) doRoll(t, el.dataset.col); },
  toggleFolder: (el) => {
    const open = (ui.drafts.openFolders ||= {});
    const f = el.dataset.folder;
    open[f] = open[f] === false; // flip (default is open)
    emit();
  },
  new: () => {
    clearEditDrafts();
    ui.drafts.editing = newTable(folders()[0] || 'My Tables');
    ui.drafts.editText = '';
    emit();
  },
  edit: (el) => {
    clearEditDrafts();
    ui.drafts.editing = structuredClone(getTable(el.dataset.id));
    emit();
  },
  cancelEdit: () => { clearEditDrafts(); emit(); },
  saveEdit: () => {
    const t = collectEdit();
    if (!t.entries.length) return toast('Add at least one entry');
    saveTable(t);
    clearEditDrafts();
    toast('Saved');
    emit();
  },
  testEdit: () => {
    const t = collectEdit();
    if (!t.entries.length) return toast('Add at least one entry');
    const r = rollTable(t.columns ? columnTable(t) : t);
    toast(`${r.shown}: ${r.text}`.slice(0, 120));
  },
  deleteTable: async () => {
    const t = ui.drafts.editing;
    if (!(await askConfirm(`Delete "${t.name}"? This can't be undone.`, 'Delete'))) return;
    deleteTable(t.id);
    clearEditDrafts();
    emit();
  },
  exportPack: (el) => {
    const f = el.dataset.folder;
    saveJSON(`${f.replace(/[^\w -]+/g, '')}.pack.json`, exportPack(f));
  },
  bulk: () => openBulk(),
  renameFolder: async (el) => {
    const from = el.dataset.folder;
    const to = await askText('Rename / move folder (use / for sub-folders)', from);
    if (to == null || !to.trim() || to.trim() === from) return;
    const n = renameFolder(from, to);
    toast(`Moved ${n} table${n === 1 ? '' : 's'}`);
  },
  importPack: async () => {
    try {
      const n = importPack(await openJSON());
      toast(`Imported ${n} table${n === 1 ? '' : 's'}`);
    } catch (e) { toast(e.message); }
  },
};

// ---------------------------------------------------------------
// Bulk paste: many tables in one go, each under a "# Name" line.
// ---------------------------------------------------------------
function openBulk() {
  const el = sheet('Bulk paste tables', `
    <p class="muted small">Paste straight from the PDF. Each table needs a heading above it: an ALL-CAPS title copied from the book counts,
      or type <code># Table name</code>. Numbered lines (<code>1: Word</code>, <code>01-05 Text</code>), ranges on their own line, and plain lists all work.</p>
    <p class="muted small"><b>Tables printed side by side?</b> Paste the whole page: when several headings come one after another, the entries are
      dealt out to those tables in order. Check the counts below (100 each for Elements) before importing.
      Use <code>/</code> in the folder name for sub-folders, e.g. <code>Mythic/Elements</code>. Tables with the same folder and name are replaced.</p>
    <label>Folder
      <select id="bulk-folder-pick">
        ${folderPaths().map((f) => `<option value="${esc(f)}" ${ui.drafts.bulkFolder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
        <option value="__new" ${!folderPaths().includes(ui.drafts.bulkFolder) ? 'selected' : ''}>＋ New folder…</option>
      </select>
      <input type="text" id="bulk-folder" placeholder="New folder name (use / for sub-folders)" value="${esc(folderPaths().includes(ui.drafts.bulkFolder) ? '' : ui.drafts.bulkFolder || 'Mythic')}"></label>
    <label>Available in
      <select id="bulk-scope">
        <option value="global">All campaigns (library)</option>
        <option value="campaign">Only this campaign (${esc(activeCampaign()?.name || '')})</option>
      </select></label>
    <textarea rows="14" id="bulk-text" spellcheck="false" placeholder="# First table\n1: …\n2: …\n\n# Second table\n1-50 …\n51-100 …"></textarea>
    <p class="muted small" id="bulk-preview"></p>
    <button class="primary wide" data-bulk="import">Import</button>`);
  // Show the "new folder" box only when "New folder…" is picked.
  const pickSel = el.querySelector('#bulk-folder-pick'), newBox = el.querySelector('#bulk-folder');
  const syncBox = () => { newBox.style.display = pickSel.value === '__new' ? '' : 'none'; };
  pickSel.addEventListener('change', syncBox);
  syncBox();
  const text = el.querySelector('#bulk-text');
  const preview = el.querySelector('#bulk-preview');
  const update = () => {
    const found = parseBulk(text.value);
    preview.innerHTML = found.length
      ? found.map((t) => {
        const c = checkTable(t);
        const warn = c.gaps.length || c.overlaps.length ? ` ⚠︎ ${c.gaps.length ? `${c.gaps.length} gaps` : ''}${c.overlaps.length ? ` ${c.overlaps.length} overlaps` : ''}` : '';
        return `${esc(t.name)}: ${t.columns ? `grid, ${t.columns.length} columns (${t.columns.map((x) => esc(x.name)).join(', ')})` : `${t.entries.length} entries`} (${t.die === 'card' ? 'card A–K' : `d${c.size}`})${warn}`;
      }).join('<br>')
      : 'No tables found yet. Add a <code># Name</code> line above each table.';
  };
  text.addEventListener('input', update);
  update();
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-bulk="import"]')) return;
    const pick = el.querySelector('#bulk-folder-pick').value;
    const folder = (pick === '__new' ? el.querySelector('#bulk-folder').value : pick)
      .split('/').map((p) => p.trim()).filter(Boolean).join('/') || 'Imported';
    const scope = el.querySelector('#bulk-scope').value === 'campaign' ? activeCampaign()?.id || null : null;
    ui.drafts.bulkFolder = folder;
    const found = parseBulk(text.value);
    if (!found.length) return toast('No tables found');
    const n = importPack({ format: 'tabletop-kit-pack', version: 1, name: folder,
      tables: found.map((t) => ({ ...t, folder })) }, scope);
    closeSheet();
    toast(`Imported ${n} table${n === 1 ? '' : 's'} into ${folder}`);
  });
}

export { closeSheet, sheet };
