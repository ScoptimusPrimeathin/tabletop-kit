// =============================================================
// views/dice.js — the Dice screen
// -------------------------------------------------------------
// Every view module exports:
//   render()  → HTML string for the screen
//   actions   → { name: (element, event) => … } run when something
//               with data-act="name" is tapped (wired up in app.js)
// Text inputs use data-draft="key" so what you type is kept in
// ui.drafts and survives the screen re-drawing.
// =============================================================

import { state, ui, save, emit } from '../state.js';
import { roll, describe } from '../dice.js';
import { addLog } from '../log.js';
import { esc, richText, toast } from '../ui.js';

const DICE = [4, 6, 8, 10, 12, 20, 100];

export const title = 'Dice';

export function render() {
  const expr = ui.drafts.dice ?? '';
  const res = ui.results.dice;
  return `
  <section class="card result-card ${res ? '' : 'empty'}">
    ${res ? res.error
      ? `<p class="error">${esc(res.error)}</p>`
      : `<div class="big-number">${res.total}</div>
         <div class="muted">${esc(res.expr)}</div>
         <div class="breakdown">${richText(describe(res, true))}</div>`
      : '<p class="muted">Tap a die to roll it, or build an expression below.</p>'}
  </section>

  <section class="card">
    <h3>Quick roll</h3>
    <div class="die-grid">
      ${DICE.map((d) => `<button class="die-btn" data-act="quick" data-sides="${d}">d${d}</button>`).join('')}
      <button class="die-btn" data-act="quick" data-expr="4dF">dF×4</button>
    </div>
  </section>

  <section class="card">
    <h3>Expression</h3>
    <div class="row">
      <input type="text" inputmode="text" autocapitalize="off" autocomplete="off" spellcheck="false"
        placeholder="e.g. 2d6+1, 4d6kh3, 2d20kl1" data-draft="dice" value="${esc(expr)}" data-enter="roll">
      <button class="primary" data-act="roll">Roll</button>
    </div>
    <div class="chip-row">
      ${DICE.slice(0, 6).map((d) => `<button class="chip" data-act="append" data-sides="${d}">+d${d}</button>`).join('')}
      <button class="chip" data-act="clear">Clear</button>
    </div>
    <h3>Favourites</h3>
    <div class="chip-row">
      ${state.dice.favorites.map((f, i) => `
        <span class="chip fav"><button data-act="fav" data-expr="${esc(f)}">${esc(f)}</button><button class="x" data-act="unfav" data-i="${i}" aria-label="Remove">×</button></span>`).join('')}
      <button class="chip ghost" data-act="addfav">☆ Save current</button>
    </div>
    <details class="help"><summary>Notation help</summary>
      <p><code>3d6+2</code> add dice and numbers · <code>2d20kh1</code> keep highest (advantage) ·
      <code>2d20kl1</code> keep lowest · <code>4d6kh3</code> stats · <code>d%</code> percentile ·
      <code>4dF</code> Fate dice · <code>1d8+1d6-1</code> mix them.</p>
    </details>
  </section>`;
}

/** Roll an expression, show it, and log it. */
function doRoll(expr) {
  try {
    const res = roll(expr);
    ui.results.dice = res;
    addLog('dice', `${res.expr} → ${res.total}`, describe(res, true));
  } catch (e) {
    ui.results.dice = { error: e.message };
    emit();
  }
}

export const actions = {
  quick: (el) => doRoll(el.dataset.expr || `1d${el.dataset.sides}`),
  roll: () => doRoll(ui.drafts.dice || ''),
  fav: (el) => { ui.drafts.dice = el.dataset.expr; doRoll(el.dataset.expr); },
  append: (el) => {
    // Merge "+d6" into an existing "2d6" → "3d6"; otherwise append.
    const add = `d${el.dataset.sides}`;
    let cur = (ui.drafts.dice || '').trim();
    const re = new RegExp(`(^|\\+)(\\d*)${add}(?=$|\\+|-)`);
    const m = cur.match(re);
    if (m) {
      const n = (m[2] ? parseInt(m[2], 10) : 1) + 1;
      cur = cur.replace(re, `${m[1]}${n}${add}`);
    } else {
      cur = cur ? `${cur}+1${add}` : `1${add}`;
    }
    ui.drafts.dice = cur;
    emit();
  },
  clear: () => { ui.drafts.dice = ''; emit(); },
  addfav: () => {
    const e = (ui.drafts.dice || '').trim();
    if (!e) return toast('Type an expression first');
    try { roll(e); } catch (err) { return toast(err.message); }
    if (!state.dice.favorites.includes(e)) state.dice.favorites.push(e);
    save('dice'); emit();
  },
  unfav: (el) => {
    state.dice.favorites.splice(+el.dataset.i, 1);
    save('dice'); emit();
  },
};
