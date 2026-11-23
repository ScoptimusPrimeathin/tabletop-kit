// =============================================================
// views/cards.js — playing cards + tarot (with meanings)
// =============================================================

import { state, ui, save, emit } from '../state.js';
import { draw, reshuffleAll, returnLast, counts, playingCard } from '../decks.js';
import { TAROT, TAROT_BY_ID, SPREADS, SUITS, RANK_MEANING, GUIDE } from '../data/tarot.js';
import { addLog } from '../log.js';
import { esc, toast, sheet } from '../ui.js';

export const title = 'Cards';

// Which sub-screen is open: 'tarot' or 'standard'.
const mode = () => ui.drafts.cardMode || 'tarot';

export function render() {
  const m = mode();
  return `
  <div class="segmented">
    <button class="${m === 'tarot' ? 'on' : ''}" data-act="mode" data-mode="tarot">🔮 Tarot</button>
    <button class="${m === 'standard' ? 'on' : ''}" data-act="mode" data-mode="standard">🃏 Playing cards</button>
  </div>
  ${m === 'tarot' ? renderTarot() : renderStandard()}`;
}

// ---------------------------------------------------------------
// Playing cards
// ---------------------------------------------------------------
function renderStandard() {
  const c = counts('standard');
  const res = ui.results.standard;
  return `
  <section class="card result-card ${res ? '' : 'empty'}">
    ${res ? `<div class="card-row">${res.cards.map((card) => {
      const p = playingCard(card.id);
      return `<div class="pcard ${p.red ? 'red' : ''}"><span>${esc(p.short)}</span><small>${esc(p.name)}</small></div>`;
    }).join('')}</div>${res.reshuffled ? '<p class="muted">Deck ran out and was reshuffled.</p>' : ''}`
    : '<p class="muted">Draw a card. Drawn cards stay out until you shuffle them back.</p>'}
  </section>
  <section class="card">
    <div class="row spread">
      <button class="primary" data-act="drawStd" data-n="1">Draw 1</button>
      <button data-act="drawStd" data-n="2">Draw 2</button>
      <button data-act="drawStd" data-n="3">Draw 3</button>
    </div>
    <p class="muted center">${c.left} in deck · ${c.out} drawn · jokers ${state.settings.jokers ? 'in' : 'out'}</p>
    <div class="row spread">
      <button data-act="returnLast" data-deck="standard">↩︎ Put last back</button>
      <button data-act="reshuffle" data-deck="standard">⟳ Shuffle all back</button>
    </div>
    <label class="toggle"><input type="checkbox" data-act="jokers" ${state.settings.jokers ? 'checked' : ''}> Include jokers</label>
  </section>`;
}

// ---------------------------------------------------------------
// Tarot
// ---------------------------------------------------------------
function renderTarot() {
  const c = counts('tarot');
  const res = ui.results.tarot;
  const spreadId = ui.drafts.spread || 'one';
  return `
  ${res ? `<section class="card">
      <h3>${esc(res.spread.name)}${res.question ? ` — <i>${esc(res.question)}</i>` : ''}</h3>
      ${res.cards.map((card, i) => tarotBlock(card, res.spread.positions[i])).join('')}
      ${res.reshuffled ? '<p class="muted">Deck ran out and was reshuffled.</p>' : ''}
    </section>` : ''}
  <section class="card">
    <h3>Draw</h3>
    <input type="text" placeholder="Question (optional)" data-draft="tarotQ" value="${esc(ui.drafts.tarotQ || '')}">
    <select data-draft="spread" data-rerender>
      ${SPREADS.map((s) => `<option value="${s.id}" ${s.id === spreadId ? 'selected' : ''}>${esc(s.name)} (${s.positions.length})</option>`).join('')}
    </select>
    <button class="primary wide" data-act="drawTarot">Draw ${esc(SPREADS.find((s) => s.id === spreadId).name)}</button>
    <p class="muted center">${c.left} in deck · ${c.out} drawn · reversals ${state.settings.tarotReversals ? 'on' : 'off'}</p>
    <div class="row spread">
      <button data-act="reshuffle" data-deck="tarot">⟳ Shuffle all back</button>
      <button data-act="guide">📖 How to read</button>
      <button data-act="browse">🗂 All cards</button>
    </div>
    <label class="toggle"><input type="checkbox" data-act="reversals" ${state.settings.tarotReversals ? 'checked' : ''}> Allow reversed cards</label>
  </section>`;
}

/** One drawn tarot card with its meaning. */
function tarotBlock(card, position) {
  const t = TAROT_BY_ID[card.id];
  const kw = card.rev ? t.rev : t.up;
  const extra = t.arcana === 'minor'
    ? `<p class="muted small">${esc(t.suit)} (${esc(SUITS[t.suit].element)}): ${esc(SUITS[t.suit].theme)} ${esc(t.rank)}: ${esc(RANK_MEANING[t.rank])}</p>`
    : '<p class="muted small">Major Arcana: a big theme or turning point.</p>';
  return `
  <div class="tarot ${card.rev ? 'rev' : ''}">
    ${position ? `<div class="pos">${esc(position)}</div>` : ''}
    <div class="tname">${esc(t.name)} <span class="orient">${card.rev ? '⤓ Reversed' : '⤒ Upright'}</span></div>
    <div class="kw">${kw.map(esc).join(' · ')}</div>
    <p>${esc(card.rev ? t.revText : t.upText)}</p>
    <details><summary>${card.rev ? 'Upright' : 'Reversed'} meaning, for comparison</summary>
      <div class="kw">${(card.rev ? t.up : t.rev).map(esc).join(' · ')}</div>
      <p>${esc(card.rev ? t.upText : t.revText)}</p>
    </details>
    ${extra}
  </div>`;
}

/** Markdown for the log. */
function tarotMarkdown(res) {
  return res.cards.map((card, i) => {
    const t = TAROT_BY_ID[card.id];
    const pos = res.spread.positions[i];
    const kw = (card.rev ? t.rev : t.up).join(', ');
    return `**${pos}: ${t.name}${card.rev ? ' (reversed)' : ''}**: ${kw}. ${card.rev ? t.revText : t.upText}`;
  }).join('\n');
}

export const actions = {
  mode: (el) => { ui.drafts.cardMode = el.dataset.mode; emit(); },

  drawStd: (el) => {
    const res = draw('standard', +el.dataset.n);
    if (!res.cards.length) return toast('Every card is already drawn');
    ui.results.standard = res;
    const names = res.cards.map((c) => playingCard(c.id));
    addLog('card', `Drew ${names.map((p) => p.short).join(' ')}`,
      names.map((p) => p.name).join(', ') + (res.reshuffled ? ' *(deck reshuffled)*' : ''));
  },

  drawTarot: () => {
    const spread = SPREADS.find((s) => s.id === (ui.drafts.spread || 'one'));
    const res = draw('tarot', spread.positions.length);
    const result = { ...res, spread, question: (ui.drafts.tarotQ || '').trim() };
    ui.results.tarot = result;
    addLog('tarot', `Tarot · ${spread.name}${result.question ? `: ${result.question}` : ''}`,
      tarotMarkdown(result));
  },

  reshuffle: (el) => {
    reshuffleAll(el.dataset.deck);
    ui.results[el.dataset.deck] = null;
    toast('Shuffled');
  },
  returnLast: (el) => {
    const c = returnLast(el.dataset.deck);
    toast(c ? 'Card returned and shuffled in' : 'Nothing to return');
  },
  jokers: (el) => { state.settings.jokers = el.checked; save('settings'); emit(); },
  reversals: (el) => { state.settings.tarotReversals = el.checked; save('settings'); emit(); },

  guide: () => {
    sheet('How to read tarot', GUIDE.map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join(''));
  },

  browse: () => {
    const groups = [['Major Arcana', TAROT.filter((t) => t.arcana === 'major')],
      ...Object.keys(SUITS).map((s) => [s, TAROT.filter((t) => t.suit === s)])];
    sheet('All 78 cards', groups.map(([g, cards]) => `
      <h3>${esc(g)}</h3>
      ${cards.map((t) => `<details class="ref"><summary>${esc(t.name)}</summary>
        <p><b>Upright:</b> ${t.up.map(esc).join(', ')}. ${esc(t.upText)}</p>
        <p><b>Reversed:</b> ${t.rev.map(esc).join(', ')}. ${esc(t.revText)}</p></details>`).join('')}`).join(''));
  },
};
