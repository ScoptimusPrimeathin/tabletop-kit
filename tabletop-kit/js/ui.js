// =============================================================
// ui.js — small shared helpers for drawing the screen
// =============================================================

/**
 * Escape text before putting it inside HTML. ALWAYS use this on
 * anything the user typed or that came from a table, otherwise a
 * "<" in your notes could break the page.
 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Escape + turn line breaks into <br> and **bold** into <b>. */
export function richText(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/\n/g, '<br>');
}

let toastTimer;
/** Brief message at the bottom of the screen. */
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/** Copy text to the clipboard (must be called from a tap). */
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    // Old-school fallback for browsers that block the clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied');
  }
}

/**
 * Save a JSON file. On iPhone/iPad the share sheet is the most
 * reliable way ("Save to Files", AirDrop…). Elsewhere, download.
 */
export async function saveJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Let the user pick a .json file; resolves to the parsed object. */
export function openJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try { resolve(JSON.parse(await f.text())); }
      catch { reject(new Error("Couldn't read that file as JSON.")); }
    };
    input.click();
  });
}

/** Format a timestamp as a short local time, e.g. "7:42 PM". */
export function time(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Show a modal sheet. `html` is the body; returns the sheet element. */
export function sheet(title, html) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="sheet-body">${html}</div>
    </div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.appendChild(wrap);
  return wrap.querySelector('.sheet');
}

/**
 * In-app replacements for confirm() and prompt(). iOS home-screen
 * apps handle the browser pop-ups badly, so we use our own sheet.
 * Both return Promises:  if (await askConfirm('Delete?')) …
 */
export function askConfirm(message, okLabel = 'OK') {
  return new Promise((resolve) => {
    const el = sheet('Are you sure?', `<p>${esc(message)}</p>
      <div class="row spread"><button data-ans="no">Cancel</button>
      <button class="primary" data-ans="yes">${esc(okLabel)}</button></div>`);
    finish(el, resolve, (ans) => ans === 'yes');
  });
}

export function askText(title, value = '') {
  return new Promise((resolve) => {
    const el = sheet(title, `<input type="text" id="ask-input" value="${esc(value)}">
      <div class="row spread"><button data-ans="no">Cancel</button>
      <button class="primary" data-ans="yes">OK</button></div>`);
    const input = el.querySelector('#ask-input');
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.querySelector('[data-ans="yes"]').click();
    });
    finish(el, resolve, (ans) => (ans === 'yes' ? input.value : null));
  });
}

// Shared: resolve when a button is tapped or the sheet is closed.
function finish(el, resolve, toValue) {
  let done = false;
  const wrap = el.parentElement;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ans]');
    if (!b) return;
    done = true;
    resolve(toValue(b.dataset.ans));
    closeSheet();
  });
  // Closing with ✕ or tapping outside counts as "cancel".
  new MutationObserver((_, obs) => {
    if (!document.body.contains(wrap)) { obs.disconnect(); if (!done) resolve(toValue('no')); }
  }).observe(document.body, { childList: true });
}

export function closeSheet() {
  document.querySelectorAll('.sheet-wrap').forEach((s) => s.remove());
}
