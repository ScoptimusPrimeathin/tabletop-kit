// =============================================================
// app.js — starts the app and wires the screens together
// -------------------------------------------------------------
// Layout:
//   phone  → one screen at a time + bottom tab bar (Log is a tab)
//   iPad   → sidebar tabs, the screen in the middle, and the log
//            always visible on the right (wide screens only)
//
// Taps: instead of attaching a listener to every button, we put
// ONE listener on the page and look for the nearest element with
// data-act="…". That's called "event delegation", and it keeps
// working after the screen re-draws.
// =============================================================

import { state, ui, load, subscribe, emit, save, activeCampaign } from './state.js';
import { openCampaigns } from './views/campaigns.js';
import * as dice from './views/dice.js';
import * as cards from './views/cards.js';
import * as tables from './views/tables.js';
import * as mythic from './views/mythic.js';
import * as track from './views/track.js';
import * as npcsView from './views/npcs.js';
import * as apoView from './views/apothecaria.js';
import * as logView from './views/log.js';
import * as settings from './views/settings.js';
import { importPack } from './tables.js';
import { upgradeLibrary } from './apothecaria.js';
import { EXAMPLES_PACK } from './data/examples.js';
import { closeSheet } from './ui.js';

// Tab order and icons. `phone: false` hides a tab from the bottom bar.
const TABS = [
  { id: 'dice', icon: '🎲', view: dice },
  { id: 'cards', icon: '🔮', view: cards },
  { id: 'tables', icon: '📜', view: tables },
  { id: 'mythic', icon: '🌀', view: mythic },
  { id: 'npcs', icon: '👥', view: npcsView },
  // Game tabs only appear when the campaign's Game matches (see view.visible).
  { id: 'apothecaria', icon: '🌿', view: apoView },
  { id: 'track', icon: '📊', view: track },
  { id: 'log', icon: '📖', view: logView },
  { id: 'settings', icon: '⚙︎', view: settings, phone: false },
];
const tabById = (id) => TABS.find((t) => t.id === id);
/** Tabs for the current campaign (game tabs hide unless they apply). */
const shownTabs = () => TABS.filter((t) => !t.view.visible || t.view.visible());

const wide = window.matchMedia('(min-width: 900px)');

// ---------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------
function render() {
  // If the log tab is open when we switch to wide mode, show dice instead.
  if (wide.matches && ui.tab === 'log') ui.tab = 'dice';
  // Switched to a campaign that doesn't use this game tab? Go to dice.
  if (!shownTabs().some((t) => t.id === ui.tab)) ui.tab = 'dice';
  const tab = tabById(ui.tab);

  applyTheme();
  document.getElementById('title').textContent = tab.view.title;
  const camp = activeCampaign();
  document.getElementById('campaign-btn').textContent = `${camp ? camp.name : 'Campaign'} ▾`;

  // Keep the scroll position and focused input across re-draws.
  const main = document.getElementById('main');
  const scroll = main.scrollTop;
  const focused = document.activeElement?.dataset?.draft;

  main.innerHTML = tab.view.render();
  main.scrollTop = scroll;

  const side = document.getElementById('side-log');
  if (wide.matches) {
    side.innerHTML = logView.render();
    scrollLogToEnd(side);
  } else if (ui.tab === 'log') {
    scrollLogToEnd(main);
  }

  document.getElementById('nav').innerHTML = shownTabs()
    .filter((t) => wide.matches ? t.id !== 'log' : t.phone !== false)
    .map((t) => `<button class="${t.id === ui.tab ? 'on' : ''}" data-tab="${t.id}">
      <span class="ico">${t.icon}</span><span class="lbl">${t.view.title}</span></button>`).join('');

  if (focused) {
    const el = document.querySelector(`[data-draft="${focused}"]`);
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; } // caret to end
  }
}

function scrollLogToEnd(container) {
  const list = container.querySelector('.log-entries');
  if (list) list.scrollTop = list.scrollHeight;
}

function applyTheme() {
  const t = state.settings.theme;
  document.documentElement.dataset.theme = t === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
}

// Redraw at most once per animation frame, however many emits.
let queued = false;
subscribe(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
});

// ---------------------------------------------------------------
// Events
// ---------------------------------------------------------------
/** Which view owns this element? (side log vs main screen) */
function viewFor(el) {
  if (el.closest('#side-log')) return logView;
  return tabById(ui.tab).view;
}

document.addEventListener('click', (e) => {
  // Tab bar
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    ui.tab = tabBtn.dataset.tab;
    closeSheet();
    document.getElementById('main').scrollTop = 0;
    emit();
    return;
  }
  if (e.target.closest('#settings-btn')) { ui.tab = 'settings'; emit(); return; }
  if (e.target.closest('#campaign-btn')) { openCampaigns(); return; }

  // data-act buttons (checkboxes are handled on "change" below)
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input[type=checkbox]') || el.closest('.sheet')) return;
  const fn = viewFor(el).actions[el.dataset.act];
  if (fn) fn(el, e);
});

// Typing: keep drafts so re-draws don't wipe what you typed.
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft) ui.drafts[el.dataset.draft] = el.value;
  if (el.dataset.edit && ui.drafts.editing) ui.drafts.editing[el.dataset.edit] = el.value;
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.closest('.sheet')) return;
  if (el.dataset.draft) ui.drafts[el.dataset.draft] = el.value;
  if (el.dataset.edit && ui.drafts.editing) ui.drafts.editing[el.dataset.edit] = el.value;
  if (el.dataset.setting) settings.onSetting(el.dataset.setting, el.value);
  if (el.matches('input[type=checkbox][data-act]')) viewFor(el).actions[el.dataset.act]?.(el, e);
  viewFor(el).onChange?.(el, e); // views can react to their own fields
  if (el.hasAttribute('data-rerender') || el.hasAttribute('data-rerender-blur')) emit();
});

// Enter key in a text box triggers its data-enter action.
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.key !== 'Enter' || !el.dataset.enter || el.tagName === 'TEXTAREA') return;
  e.preventDefault();
  ui.drafts[el.dataset.draft] = el.value;
  viewFor(el).actions[el.dataset.enter]?.(el, e);
});

wide.addEventListener('change', render);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', render);

// ---------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------
async function start() {
  await load();
  upgradeLibrary(); // fix up Apothecaria data saved by older versions
  // First launch: add the example tables + open a session.
  if (!state.tables.length && !state.log.length) {
    importPack(EXAMPLES_PACK);
    state.log.push({ id: 'welcome', ts: Date.now(), kind: 'session', title: `Session — ${new Date().toLocaleDateString()}`, sent: true });
    save('log');
  }
  settings.checkPersistence();
  render();

  // Register the service worker (offline support). It needs https
  // or localhost; elsewhere it fails quietly and the app still runs.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
