// =============================================================
// log.js — the session log + Markdown / Obsidian export
// -------------------------------------------------------------
// Every result (dice, cards, tables, Mythic) becomes a log entry:
//   { id, ts, kind, title, body, sent }
//     kind  — 'dice' | 'card' | 'tarot' | 'table' | 'mythic'
//             | 'track' | 'note' | 'session' | 'scene'
//     title — one-line summary, e.g. "2d6+1 → 9"
//     body  — Markdown details (can be empty)
//     sent  — true once it has been sent to Obsidian
//
// A 'session' entry is a divider: "the current session" means
// every entry after the most recent session divider.
// =============================================================

import { state, save, emit } from './state.js';
import { logURI, go } from './obsidian.js';
import { uid } from './rng.js';

const MAX_ENTRIES = 3000; // old entries roll off so storage never balloons

/** Add an entry to the log. Returns the entry. */
export function addLog(kind, title, body = '') {
  const entry = { id: uid(), ts: Date.now(), kind, title, body, sent: false };
  state.log.push(entry);
  if (state.log.length > MAX_ENTRIES) state.log.splice(0, state.log.length - MAX_ENTRIES);
  save('log');
  emit();
  return entry;
}

export function startSession(name) {
  const title = name || `Session — ${new Date().toLocaleDateString()}`;
  return addLog('session', title);
}

/** Entries in the current session (after the last divider). */
export function currentSession() {
  let start = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    if (state.log[i].kind === 'session') { start = i; break; }
  }
  return state.log.slice(start);
}

export function removeEntry(id) {
  state.log = state.log.filter((e) => e.id !== id);
  save('log');
  emit();
}

// Callout types per kind. Obsidian renders any type; these just
// pick nicer built-in colours/icons.
const CALLOUT = {
  dice: 'example', card: 'abstract', tarot: 'abstract', table: 'info',
  mythic: 'question', track: 'tip', npc: 'quote',
};

/** Convert entries to Markdown for pasting/sending to Obsidian. */
export function toMarkdown(entries, style = state.settings.exportStyle) {
  const out = [];
  for (const e of entries) {
    if (e.kind === 'session') { out.push(`## ${e.title}`); continue; }
    if (e.kind === 'scene') { out.push(`### ${e.title}`); continue; }
    if (e.kind === 'note') { out.push(e.title + (e.body ? `\n${e.body}` : '')); continue; }
    if (style === 'callout') {
      const lines = [`> [!${CALLOUT[e.kind] || 'note'}] ${e.title}`];
      if (e.body) e.body.split('\n').forEach((l) => lines.push(`> ${l}`));
      out.push(lines.join('\n'));
    } else {
      out.push(`- **${e.title}**` + (e.body ? `\n  ${e.body.replace(/\n/g, '\n  ')}` : ''));
    }
  }
  return out.join('\n\n') + '\n';
}

/** The campaign's log destination (see obsidian.js). */
export const obsidianURI = (markdown) => logURI(markdown);

/** Send every not-yet-sent entry of the log to the campaign's log note. */
export function sendUnsentToObsidian() {
  const unsent = state.log.filter((e) => !e.sent);
  if (!unsent.length) return 0;
  const link = logURI(toMarkdown(unsent));
  unsent.forEach((e) => { e.sent = true; });
  save('log');
  emit();
  go(link);
  return unsent.length;
}

/** Mark entries as sent (after they went to some note). */
export function markEntriesSent(entries) {
  entries.forEach((e) => { e.sent = true; });
  save('log');
  emit();
}
