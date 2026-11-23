// =============================================================
// views/track.js — counters and lists (HP, clocks, supplies,
// NPCs, rumours…). Mythic's threads/characters live here too.
// =============================================================

import { state, ui, save, emit } from '../state.js';
import { uid, rollDie } from '../rng.js';
import { addLog } from '../log.js';
import { esc, toast, askConfirm } from '../ui.js';

export const title = 'Track';

export function render() {
  const { counters, lists } = state.trackers;
  return `
  <section class="card">
    <h3>Counters</h3>
    ${counters.length ? '' : '<p class="muted small">Health, supplies, clocks, weeks passed…</p>'}
    ${counters.map((c) => `
      <div class="counter">
        <span class="cname">${esc(c.name)}${c.max != null ? ` <span class="muted small">/ ${c.max}</span>` : ''}</span>
        <button class="round" data-act="bump" data-id="${c.id}" data-d="-1">−</button>
        <span class="cval">${c.value}</span>
        <button class="round" data-act="bump" data-id="${c.id}" data-d="1">＋</button>
        <button class="icon-btn" data-act="rmCounter" data-id="${c.id}" aria-label="Delete">✕</button>
      </div>`).join('')}
    <div class="row">
      <input type="text" placeholder="Name" data-draft="cName" value="${esc(ui.drafts.cName || '')}">
      <input type="number" class="narrow" placeholder="Start" data-draft="cStart" value="${esc(ui.drafts.cStart ?? '')}">
      <input type="number" class="narrow" placeholder="Max" data-draft="cMax" value="${esc(ui.drafts.cMax ?? '')}">
      <button data-act="addCounter">Add</button>
    </div>
  </section>

  ${lists.map((l) => `
  <section class="card">
    <div class="row spread"><h3>${esc(l.name)} <span class="muted">(${l.items.length})</span></h3>
      <span><button data-act="pickList" data-id="${l.id}" ${l.items.length ? '' : 'disabled'}>🎲</button>
      ${l.id.startsWith('mythic-') ? '' : `<button class="icon-btn" data-act="rmList" data-id="${l.id}" aria-label="Delete list">✕</button>`}</span></div>
    <ul class="list">${l.items.map((it) => `<li><span>${esc(it.text)}</span>
      <button class="icon-btn" data-act="rmItem" data-id="${l.id}" data-item="${it.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>
    <div class="row"><input type="text" placeholder="Add item" data-draft="li-${l.id}" value="${esc(ui.drafts['li-' + l.id] || '')}" data-enter="addItem" data-id="${l.id}">
      <button data-act="addItem" data-id="${l.id}">Add</button></div>
  </section>`).join('')}

  <section class="card">
    <div class="row"><input type="text" placeholder="New list name" data-draft="newList" value="${esc(ui.drafts.newList || '')}" data-enter="addList">
      <button data-act="addList">＋ List</button></div>
  </section>`;
}

const findCounter = (id) => state.trackers.counters.find((c) => c.id === id);
const findList = (id) => state.trackers.lists.find((l) => l.id === id);
const done = () => { save('trackers'); emit(); };

export const actions = {
  bump: (el) => {
    const c = findCounter(el.dataset.id);
    let v = c.value + +el.dataset.d;
    if (c.max != null) v = Math.min(v, c.max);
    c.value = v;
    done();
  },
  addCounter: () => {
    const name = (ui.drafts.cName || '').trim();
    if (!name) return toast('Give the counter a name');
    const max = ui.drafts.cMax === '' || ui.drafts.cMax == null ? null : +ui.drafts.cMax;
    state.trackers.counters.push({ id: uid(), name, value: +(ui.drafts.cStart || 0), max });
    ui.drafts.cName = ui.drafts.cStart = ui.drafts.cMax = '';
    done();
  },
  rmCounter: async (el) => {
    if (!(await askConfirm('Delete this counter?', 'Delete'))) return;
    state.trackers.counters = state.trackers.counters.filter((c) => c.id !== el.dataset.id);
    done();
  },
  addList: () => {
    const name = (ui.drafts.newList || '').trim();
    if (!name) return;
    state.trackers.lists.push({ id: uid(), name, items: [] });
    ui.drafts.newList = '';
    done();
  },
  rmList: async (el) => {
    if (!(await askConfirm('Delete this list?', 'Delete'))) return;
    state.trackers.lists = state.trackers.lists.filter((l) => l.id !== el.dataset.id);
    done();
  },
  addItem: (el) => {
    const key = 'li-' + el.dataset.id;
    const text = (ui.drafts[key] || '').trim();
    if (!text) return;
    findList(el.dataset.id).items.push({ id: uid(), text });
    ui.drafts[key] = '';
    done();
  },
  rmItem: (el) => {
    const l = findList(el.dataset.id);
    l.items = l.items.filter((i) => i.id !== el.dataset.item);
    done();
  },
  pickList: (el) => {
    const l = findList(el.dataset.id);
    const it = l.items[rollDie(l.items.length) - 1];
    toast(it.text);
    addLog('track', `Random from ${l.name}: ${it.text}`);
  },
};
