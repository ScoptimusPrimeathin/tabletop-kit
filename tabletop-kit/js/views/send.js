// =============================================================
// views/send.js — "Send to which note?" picker
// -------------------------------------------------------------
// Used by the log (and anything else) to append Markdown to a note
// of your choice: the campaign log, today's daily note, a pinned
// note, a recent note, or a path you type.
// =============================================================

import { activeCampaign } from '../state.js';
import { vault, updateVault, appendURI, dailyURI, logURI, go, remember, cleanPath } from '../obsidian.js';
import { esc, toast, sheet, closeSheet } from '../ui.js';

/**
 * markdown: what to send
 * onSent:   called after the link is opened (e.g. mark log entries sent)
 */
export function openSendPicker(markdown, onSent = () => {}) {
  const v = vault();
  const logLabel = v.logMode === 'daily' ? "Campaign log (today's daily note)" : `Campaign log: ${v.logNote}`;
  const row = (path, pinned) => `<div class="row send-row">
      <button class="wide-left" data-to="${esc(path)}">📄 ${esc(path)}</button>
      <button class="icon-btn" data-pin="${esc(path)}" title="${pinned ? 'Unpin' : 'Pin'}">${pinned ? '★' : '☆'}</button></div>`;
  const recent = v.recent.filter((p) => !v.pinned.includes(p));
  const el = sheet('Send to note', `
    <pre class="send-preview">${esc(markdown.slice(0, 400))}${markdown.length > 400 ? '…' : ''}</pre>
    <button class="primary wide" data-to="__log">📖 ${esc(logLabel)}</button>
    ${v.logMode !== 'daily' ? '<button class="wide" data-to="__daily">📅 Today\'s daily note</button>' : ''}
    ${v.pinned.length ? `<h3>Pinned</h3>${v.pinned.map((p) => row(p, true)).join('')}` : ''}
    ${recent.length ? `<h3>Recent</h3>${recent.map((p) => row(p, false)).join('')}` : ''}
    <h3>Another note</h3>
    <div class="row"><input type="text" id="send-path" placeholder="e.g. Sessions/Session 3" autocapitalize="off">
      <button data-to="__typed">Send</button></div>
    <p class="muted small">Vault: <b>${esc(v.name || '(Settings default)')}</b> · campaign: ${esc(activeCampaign()?.name || '')}.
      Missing notes are created. Obsidian opens; swipe back to return.</p>`);

  el.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      const p = pin.dataset.pin;
      updateVault({ pinned: v.pinned.includes(p) ? v.pinned.filter((x) => x !== p) : [...v.pinned, p] });
      closeSheet(); openSendPicker(markdown, onSent);
      return;
    }
    const to = e.target.closest('[data-to]')?.dataset.to;
    if (!to) return;
    let link;
    if (to === '__log') link = logURI(markdown);
    else if (to === '__daily') link = dailyURI(markdown);
    else {
      const path = to === '__typed' ? el.querySelector('#send-path').value : to;
      if (!cleanPath(path)) return toast('Type a note name');
      remember(path);
      link = appendURI(path, markdown);
    }
    closeSheet();
    onSent();
    go(link);
  });
}
