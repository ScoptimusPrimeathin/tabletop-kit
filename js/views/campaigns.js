// =============================================================
// views/campaigns.js — the campaign menu (tap the name in the
// top bar). Switch, create, edit, archive, export/import.
// =============================================================

import {
  state, ui, emit, activeCampaign, createCampaign, switchCampaign, updateCampaign,
  deleteCampaign, exportCampaign, importCampaign,
} from '../state.js';
import { VARIANTS } from '../mythic.js';
import { vault, updateVault } from '../obsidian.js';
import { esc, toast, sheet, closeSheet, saveJSON, openJSON, askConfirm } from '../ui.js';

// Suggestions for the "game" box; you can type anything.
const GAMES = ['Mythic', 'Apothecaria', 'Apawthecaria', 'Iron Valley', 'Shadowdark',
  'Worlds Without Number', 'Traveller', 'Ars Magica', 'Fabula Ultima', 'Lancer'];

export function openCampaigns() {
  const c = activeCampaign();
  const o = c.overrides || {};
  const others = state.campaigns.list.filter((x) => x.id !== c.id && !x.archived);
  const archived = state.campaigns.list.filter((x) => x.id !== c.id && x.archived);
  const row = (x) => `<button class="wide camp-row" data-c="switch" data-id="${x.id}">
      <b>${esc(x.name)}</b> <span class="muted small">${esc(x.game || '')}</span></button>`;

  const el = sheet('Campaigns', `
    ${others.length ? `<h3>Switch to</h3>${others.map(row).join('')}` : ''}
    ${archived.length ? `<details class="help"><summary>Archived (${archived.length})</summary>${archived.map(row).join('')}</details>` : ''}

    <h3>This campaign</h3>
    <label>Name <input type="text" id="cp-name" value="${esc(c.name)}"></label>
    <label>Game <input type="text" id="cp-game" list="cp-games" value="${esc(c.game || '')}">
      <datalist id="cp-games">${GAMES.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></label>
    <label>Notes <textarea rows="3" id="cp-notes">${esc(c.notes || '')}</textarea></label>
    <label>Mythic rules
      <select id="cp-method">
        <option value="" ${!o.method ? 'selected' : ''}>Same as Mythic setup</option>
        <option value="check" ${o.method === 'check' ? 'selected' : ''}>Fate Check (2d10)</option>
        <option value="chart" ${o.method === 'chart' ? 'selected' : ''}>Fate Chart (d100)</option>
      </select></label>
    <label>Chaos variant
      <select id="cp-variant">
        <option value="" ${!o.variant ? 'selected' : ''}>Same as Mythic setup</option>
        ${Object.entries(VARIANTS).map(([k, l]) => `<option value="${k}" ${o.variant === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
    <h3>Obsidian vault for this campaign</h3>
    <label>Vault name <span class="muted small">(exactly as Obsidian shows it)</span>
      <input type="text" id="ov-name" autocapitalize="off" value="${esc(vault().name)}" placeholder="e.g. Fabula Ultima"></label>
    <label>NPC folder <input type="text" id="ov-npc" autocapitalize="off" value="${esc(vault().npcFolder)}"></label>
    <label>Faction folder <input type="text" id="ov-fac" autocapitalize="off" value="${esc(vault().factionFolder)}"></label>
    <label>Log goes to
      <select id="ov-logmode"><option value="file" ${vault().logMode === 'file' ? 'selected' : ''}>A note</option>
        <option value="daily" ${vault().logMode === 'daily' ? 'selected' : ''}>Today's daily note</option></select></label>
    <label>Log note <input type="text" id="ov-log" autocapitalize="off" value="${esc(vault().logNote)}"></label>
    <label>Overview note <input type="text" id="ov-over" autocapitalize="off" value="${esc(vault().overviewNote)}"></label>
    <p class="muted small">Folders sit at the vault root; use / for sub-folders (e.g. The World/Factions).</p>
    <button class="primary wide" data-c="save">Save changes</button>
    <div class="row spread">
      <button data-c="export">⇪ Export campaign</button>
      <button data-c="archive">🗄 Archive</button>
      <button class="danger" data-c="delete">Delete</button>
    </div>

    <h3>New campaign</h3>
    <label>Name <input type="text" id="nc-name" placeholder="e.g. Apothecaria: Hollowmere"></label>
    <label>Game <input type="text" id="nc-game" list="cp-games"></label>
    <label>Copy from
      <select id="nc-from"><option value="">Nothing (start empty)</option>
        ${state.campaigns.list.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
    <div id="nc-copy" style="display:none">
      <label class="toggle"><input type="checkbox" id="nc-lists" checked> Lists, counters and dice favourites (NPCs, threads…)</label>
      <label class="toggle"><input type="checkbox" id="nc-tables"> That campaign's own tables</label>
    </div>
    <div class="row spread">
      <button class="primary" data-c="create">＋ Create and switch</button>
      <button data-c="import">⇩ Import campaign file</button>
    </div>
    <p class="muted small">Library tables (like your Mythic tables) are shared by every campaign. Logs, decks, lists, counters,
      dice favourites and Mythic progress belong to each campaign.</p>
  `);

  el.querySelector('#nc-from').addEventListener('change', (e) => {
    el.querySelector('#nc-copy').style.display = e.target.value ? '' : 'none';
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const val = (id) => el.querySelector(id).value;
    try {
      switch (b.dataset.c) {
        case 'switch':
          closeSheet();
          await switchCampaign(b.dataset.id);
          toast(`Now playing: ${activeCampaign().name}`);
          break;
        case 'save':
          updateCampaign(c.id, {
            name: val('#cp-name').trim() || c.name, game: val('#cp-game').trim(), notes: val('#cp-notes'),
            overrides: { method: val('#cp-method'), variant: val('#cp-variant') },
          });
          updateVault({ name: val('#ov-name').trim(), npcFolder: val('#ov-npc').trim() || 'NPC', factionFolder: val('#ov-fac').trim() || 'Factions',
            logMode: val('#ov-logmode'), logNote: val('#ov-log').trim() || 'Sessions/Session Log', overviewNote: val('#ov-over').trim() || 'Campaign Overview' });
          closeSheet(); toast('Saved');
          break;
        case 'export': {
          const data = await exportCampaign(c.id);
          saveJSON(`${c.name.replace(/[^\w -]+/g, '')}.campaign.json`, data);
          break;
        }
        case 'archive': {
          const next = others[0];
          if (!next) { toast('Create or switch to another campaign first'); break; }
          if (!(await askConfirm(`Archive "${c.name}"? It's kept, just hidden in the Archived list. You'll switch to "${next.name}".`, 'Archive'))) break;
          updateCampaign(c.id, { archived: true });
          await switchCampaign(next.id);
          break;
        }
        case 'delete':
          if (!(await askConfirm(`Delete "${c.name}" with its log, lists, decks, Mythic progress and its own tables? This can't be undone. (Export it first if unsure.)`, 'Delete forever'))) break;
          await deleteCampaign(c.id);
          toast('Campaign deleted');
          break;
        case 'create': {
          const name = val('#nc-name').trim();
          if (!name) { toast('Name the new campaign'); break; }
          const from = val('#nc-from');
          closeSheet();
          await createCampaign({ name, game: val('#nc-game').trim(), copyFrom: from || null,
            copy: { lists: el.querySelector('#nc-lists').checked, tables: el.querySelector('#nc-tables').checked } });
          toast(`Created ${name}`);
          break;
        }
        case 'import': {
          const meta = await importCampaign(await openJSON());
          closeSheet();
          toast(`Imported ${meta.name}`);
          break;
        }
      }
    } catch (err) { toast(err.message); }
    emit();
  });
}

export { ui };
