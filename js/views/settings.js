// =============================================================
// views/settings.js — Obsidian, appearance, backups
// =============================================================

import { state, ui, save, emit, exportBackup, importBackup, flush } from '../state.js';
import { obsidianURI } from '../log.js';
import { esc, toast, saveJSON, openJSON, askConfirm } from '../ui.js';
import { requestPersistence } from '../store.js';
import { GAMES } from '../games.js';

export const title = 'Settings';
export const VERSION = '0.8.0';

export function render() {
  const s = state.settings;
  return `
  <section class="card">
    <h3>Game modules</h3>
    <p class="muted small">Switch on the games you play. Each one adds its own tab. Switching one off only hides the tab; its data stays.</p>
    ${GAMES.map((g) => `<label class="toggle"><input type="checkbox" data-act="toggleGame" data-game="${g.id}" ${s.games?.[g.id] ? 'checked' : ''}>
      ${g.icon} <span><b>${esc(g.name)}</b><br><span class="muted small">${esc(g.desc)}</span></span></label>`).join('')}
  </section>

  <section class="card">
    <h3>Obsidian</h3>
    <p class="muted small"><b>Each campaign has its own vault and folders</b>: set them in the campaign menu (top bar). The values here are only the fallback.</p>
    <p class="muted small">"→ Obsidian" appends log entries to a note through Obsidian's own link scheme. It works offline. Obsidian opens, adds the text, and you swipe back here.</p>
    <label>Vault name <span class="muted small">(leave blank to use the open vault)</span>
      <input type="text" data-setting="obsidianVault" value="${esc(s.obsidianVault)}" autocapitalize="off"></label>
    <label>Send to
      <select data-setting="obsidianTarget">
        <option value="daily" ${s.obsidianTarget === 'daily' ? 'selected' : ''}>Today's daily note</option>
        <option value="file" ${s.obsidianTarget === 'file' ? 'selected' : ''}>A specific note</option>
      </select></label>
    ${s.obsidianTarget === 'file' ? `<label>Note path <span class="muted small">(created if missing)</span>
      <input type="text" data-setting="obsidianFile" value="${esc(s.obsidianFile)}" autocapitalize="off"></label>` : ''}
    <label>Format
      <select data-setting="exportStyle">
        <option value="callout" ${s.exportStyle === 'callout' ? 'selected' : ''}>Callouts (boxed results)</option>
        <option value="plain" ${s.exportStyle === 'plain' ? 'selected' : ''}>Plain bullet list</option>
      </select></label>
    <button data-act="testObsidian">Send a test line</button>
  </section>

  <section class="card">
    <h3>Appearance</h3>
    <label>Theme
      <select data-setting="theme">
        ${['auto', 'dark', 'light'].map((t) => `<option value="${t}" ${s.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}
      </select></label>
  </section>

  <section class="card">
    <h3>Backup</h3>
    <p class="muted small">Everything is stored only on this device. iOS can clear web-app data that goes unused for a long time, so export a backup now and then. A backup holds <b>every campaign</b> and moves your setup between iPhone and iPad. (To share or archive one campaign, use the campaign menu in the top bar.)</p>
    <div class="row spread">
      <button data-act="exportBackup">⇪ Export backup</button>
      <button data-act="importBackup">⇩ Restore backup</button>
    </div>
    <p class="muted small" id="persist-status">${ui.drafts.persisted == null ? '' : ui.drafts.persisted ? '✓ Browser agreed to keep data persistent.' : 'Browser did not promise persistent storage, so keep backups.'}</p>
  </section>

  <section class="card">
    <p class="muted small center">Tabletop Kit v${VERSION} · works offline · ${state.campaigns.list.length} campaigns · ${state.tables.length} tables</p>
  </section>`;
}

export const actions = {
  toggleGame: (el) => {
    state.settings.games = { ...state.settings.games, [el.dataset.game]: el.checked };
    save('settings');
    emit();
  },
  testObsidian: () => {
    window.location.href = obsidianURI(`> [!example] Tabletop Kit test: ${new Date().toLocaleString()}\n`);
  },
  exportBackup: async () => {
    await flush();
    const d = new Date().toISOString().slice(0, 10);
    saveJSON(`tabletop-kit-backup-${d}.json`, await exportBackup());
  },
  importBackup: async () => {
    try {
      const obj = await openJSON();
      if (!(await askConfirm('Replace everything on this device with this backup?', 'Restore'))) return;
      await importBackup(obj);
      toast('Backup restored');
      emit();
    } catch (e) { toast(e.message); }
  },
};

/** Called by app.js when a [data-setting] field changes. */
export function onSetting(key, value) {
  state.settings[key] = value;
  save('settings');
  emit();
}

export async function checkPersistence() {
  ui.drafts.persisted = await requestPersistence();
}
