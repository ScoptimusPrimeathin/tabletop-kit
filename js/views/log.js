// =============================================================
// views/log.js — the session log (a tab on phone, a side panel
// on iPad) with copy / send-to-Obsidian buttons
// =============================================================

import { state, ui, emit } from '../state.js';
import {
  addLog, startSession, currentSession, removeEntry, toMarkdown,
  sendUnsentToObsidian, markEntriesSent,
} from '../log.js';
import { esc, richText, copy, time, toast, askText } from '../ui.js';
import { openSendPicker } from './send.js';

export const title = 'Log';

const ICON = { dice: '🎲', card: '🃏', tarot: '🔮', table: '📜', mythic: '🌀', track: '📊', note: '✎', npc: '👥' };

export function render() {
  const entries = currentSession();
  const unsent = state.log.filter((e) => !e.sent).length;
  return `
  <div class="log-tools">
    <button data-act="copySession">⧉ Copy</button>
    <button data-act="sendSessionTo">↗ Session to…</button>
    <button data-act="sendUnsent" ${unsent ? '' : 'disabled'}>→ Obsidian${unsent ? ` (${unsent})` : ''}</button>
    <button data-act="newSession">＋ Session</button>
  </div>
  <div class="log-entries">
    ${entries.length ? entries.map(renderEntry).join('') : '<p class="muted">Nothing logged yet. Rolls and draws show up here.</p>'}
  </div>
  <div class="row note-row">
    <textarea rows="2" placeholder="Add a note…" data-draft="note">${esc(ui.drafts.note || '')}</textarea>
    <button data-act="addNote">Add</button>
  </div>`;
}

function renderEntry(e) {
  if (e.kind === 'session') return `<div class="log-session">${esc(e.title)}</div>`;
  if (e.kind === 'scene') return `<div class="log-scene">${esc(e.title)}</div>`;
  return `
  <div class="log-entry ${e.sent ? 'sent' : ''}" data-id="${e.id}">
    <div class="log-head">
      <span>${ICON[e.kind] || '•'} ${richText(e.title)}</span>
      <span class="log-meta">${time(e.ts)}
        <button class="icon-btn small" data-act="copyEntry" data-id="${e.id}" aria-label="Copy">⧉</button>
        <button class="icon-btn small" data-act="sendEntry" data-id="${e.id}" aria-label="Send to Obsidian">→</button>
        <button class="icon-btn small" data-act="rmEntry" data-id="${e.id}" aria-label="Delete">✕</button>
      </span>
    </div>
    ${e.body ? `<div class="log-body">${richText(e.body)}</div>` : ''}
  </div>`;
}

const byId = (id) => state.log.find((e) => e.id === id);

export const actions = {
  copySession: () => copy(toMarkdown(currentSession())),
  sendUnsent: () => {
    const n = sendUnsentToObsidian();
    if (!n) toast('Nothing new to send');
  },
  newSession: async () => {
    const name = await askText('Session name', `Session — ${new Date().toLocaleDateString()}`);
    if (name === null) return;
    startSession(name.trim());
  },
  addNote: () => {
    const text = (ui.drafts.note || '').trim();
    if (!text) return;
    ui.drafts.note = '';
    addLog('note', text);
  },
  copyEntry: (el) => copy(toMarkdown([byId(el.dataset.id)])),
  // → on one entry: choose which note it goes to.
  sendEntry: (el) => { const e = byId(el.dataset.id); openSendPicker(toMarkdown([e]), () => markEntriesSent([e])); },
  // Whole session to any note.
  sendSessionTo: () => { const es = currentSession(); openSendPicker(toMarkdown(es), () => markEntriesSent(es)); },
  rmEntry: (el) => removeEntry(el.dataset.id),
};

export { emit };
