// =============================================================
// obsidian.js — sending things to an Obsidian vault
// -------------------------------------------------------------
// The app can't read your vault (iOS keeps apps sealed off). It CAN
// open obsidian:// links, which tell Obsidian to create a note,
// append to one, or replace one. Each link switches to Obsidian;
// swipe back (or tap "◀ Tabletop Kit" top-left) to return.
//
// Each campaign = its own vault, with folders at the vault root:
//   campaign.vault = { name, npcFolder, factionFolder, logMode,
//                      logNote, overviewNote, pinned: [], recent: [] }
//
// Notes the app OWNS (NPCs, factions, Campaign Overview) are
// replaced every time you send them: write your own story in your
// own notes and link to them ([[Marta]]).
// =============================================================

import { state, save, emit, activeCampaign } from './state.js';
import { attitudeName, relationshipOf, inMythic } from './npcs.js';
import { ensureKc, limits } from './keepingcontact.js';
import { levelName } from './data/keepingcontact.js';

export const VAULT_DEFAULTS = {
  name: '',                     // Obsidian vault name ('' = the global Settings value)
  npcFolder: 'NPC',
  factionFolder: 'The World/Factions',
  logMode: 'file',              // 'file' | 'daily'
  logNote: 'Sessions/Session Log',
  overviewNote: 'Campaign Overview',
  pinned: [],                   // note paths you send to often
  recent: [],                   // last few note paths used
};

/** The current campaign's vault settings (created on first use). */
export function vault() {
  const c = activeCampaign();
  if (!c) return { ...VAULT_DEFAULTS };
  if (!c.vault) {
    c.vault = { ...VAULT_DEFAULTS, pinned: [], recent: [] };
    // Carry over the older per-campaign "Obsidian note" setting.
    if (c.overrides?.obsidianFile) c.vault.logNote = c.overrides.obsidianFile;
    // Default: a note in Sessions/ (switch to the daily note in the campaign menu).
    save('campaigns');
  }
  for (const [k, v] of Object.entries(VAULT_DEFAULTS)) if (c.vault[k] === undefined) c.vault[k] = Array.isArray(v) ? [] : v;
  return c.vault;
}

export function updateVault(changes) {
  Object.assign(vault(), changes);
  save('campaigns'); emit();
}

/** Characters Obsidian/iOS don't allow in file names. */
export const safeName = (s) => String(s || 'Untitled').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
/** Clean "Folder/Sub/Note" path (no .md, no leading/trailing slashes). */
export const cleanPath = (p) => String(p || '').split('/').map((x) => safeName(x)).filter((x) => x && x !== 'Untitled').join('/');

// ---------------------------------------------------------------
// Links
// ---------------------------------------------------------------
function uri(action, params) {
  const v = vault();
  const name = v.name || state.settings.obsidianVault;
  const p = new URLSearchParams();
  if (name) p.set('vault', name);
  for (const [k, val] of Object.entries(params)) if (val !== undefined && val !== '') p.set(k, val);
  // URLSearchParams encodes spaces as "+"; Obsidian wants %20.
  return `obsidian://${action}?${p.toString().replace(/\+/g, '%20')}`;
}

/** Add text to the end of a note (created if missing). */
export const appendURI = (path, md) => uri('new', { file: cleanPath(path), content: '\n' + md, append: 'true' });
/** Replace a note completely (created if missing). */
export const replaceURI = (path, md) => uri('new', { file: cleanPath(path), content: md, overwrite: 'true' });
/** Add text to today's daily note. */
export const dailyURI = (md) => uri('daily', { content: '\n' + md, append: 'true' });

/** Open a link (switches to Obsidian). */
export function go(link) { window.location.href = link; }

/** Where the campaign log goes. */
export function logURI(md) {
  const v = vault();
  return v.logMode === 'daily' ? dailyURI(md) : appendURI(v.logNote || 'Session Log', md);
}

/** Remember a note path in the campaign's recent list. */
export function remember(path) {
  const v = vault();
  const p = cleanPath(path);
  if (!p) return;
  v.recent = [p, ...v.recent.filter((x) => x !== p)].slice(0, 8);
  save('campaigns');
}

// ---------------------------------------------------------------
// Note builders
// ---------------------------------------------------------------
const yamlStr = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const today = () => new Date().toISOString().slice(0, 10);
const OWNED = (what) => `> [!info] Managed by Tabletop Kit\n> This ${what} note is rewritten when you send it from the app. Edit ${what === 'NPC' ? 'the NPC' : 'it'} in the app, and write your story in your own notes linking here.`;

export const npcPath = (n) => `${cleanPath(vault().npcFolder) || 'NPC'}/${safeName(n.name)}`;
export const factionPath = (f) => `${cleanPath(vault().factionFolder) || 'Factions'}/${safeName(f.name)}`;

export function npcNote(n) {
  const kc = ensureKc(n);
  const u = n.une || {};
  const [min, max] = limits(n);
  const pairs = state.relations.filter((p) => p.kind === 'npc' && (p.a === n.id || p.b === n.id));
  const other = (p) => {
    const id = p.a === n.id ? p.b : p.a;
    if (id === 'pc') return 'You';
    const o = state.npcs.find((x) => x.id === id);
    return o ? `[[${safeName(o.name)}]]` : '?';
  };
  const lines = [
    '---',
    'tabletop-kit: npc',
    `campaign: ${yamlStr(activeCampaign()?.name)}`,
    `role: ${yamlStr(n.role)}`,
    `attitude: ${n.attitude}`,
    `attitude-name: ${yamlStr(levelName(kc.stage, n.attitude))}`,
    `relationship: ${kc.stage}`,
    `ar: ${kc.ar}`,
    `stressed: ${!!kc.stressed}`,
    `pleased: ${!!kc.pleased}`,
    `mood: ${yamlStr(n.mood)}`,
    `archived: ${!!n.archived}`,
    `in-mythic: ${inMythic(n.id)}`,
    `updated: ${today()}`,
    'tags: [npc]',
    '---',
    `# ${n.name}`,
    '',
    OWNED('NPC'),
    '',
    n.role ? `*${n.role}*\n` : '',
    '## Relationship with you',
    `- **Attitude:** ${n.attitude > 0 ? '+' : ''}${n.attitude} ${levelName(kc.stage, n.attitude)} (${attitudeName(n.attitude)})`,
    `- **Type:** ${{ default: 'Default', bond: 'Bond', romance: 'Romance' }[kc.stage]}${kc.foe ? ' · **Foe**' : ''}`,
    `- **Approval (AR):** ${kc.ar} (range ${min} to ${max})${kc.stressed ? ' · Stressed' : ''}${kc.pleased ? ' · Pleased' : ''}`,
    kc.quest.name ? `- **Personal quest:** ${kc.quest.name} (${kc.quest.done}/3)` : '',
    n.mood ? `- **Personality mood:** ${n.mood}` : '',
    '',
  ];
  if (u.modifier || u.noun || u.power || u.motivations?.length) {
    lines.push('## Profile');
    if (u.modifier || u.noun) lines.push(`- **Who:** ${[u.modifier, u.noun].filter(Boolean).join(' ')}`);
    if (u.power) lines.push(`- **Power vs. you:** ${u.power}`);
    if (u.motivations?.length) lines.push(`- **Motivations:** ${u.motivations.join('; ')}`);
    lines.push(`- **UNE relationship:** ${relationshipOf(n)}`, '');
  }
  if (pairs.length) {
    lines.push('## Relationships with others');
    for (const p of pairs) { const k = ensureKc(p); lines.push(`- ${other(p)}: ${p.attitude > 0 ? '+' : ''}${p.attitude} ${levelName(k.stage, p.attitude)}${p.notes ? ` (${p.notes})` : ''}`); }
    lines.push('');
  }
  if (n.notes) lines.push('## Notes', n.notes, '');
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

export function factionNote(f) {
  const kc = ensureKc(f);
  const label = { outsider: 'Reputation', member: 'Status', leader: 'Leadership' }[f.level];
  const ties = state.relations.filter((p) => p.kind === 'ties' && (p.a === f.id || p.b === f.id));
  const lines = [
    '---',
    'tabletop-kit: faction',
    `campaign: ${yamlStr(activeCampaign()?.name)}`,
    `standing: ${f.level}`,
    `attitude: ${f.attitude}`,
    `ar: ${kc.ar}`,
    `hunted: ${!!f.hunted}`,
    `updated: ${today()}`,
    'tags: [faction]',
    '---',
    `# ${f.name}`, '', OWNED('faction'), '',
    '## Your standing',
    `- **${label}:** ${f.attitude > 0 ? '+' : ''}${f.attitude} ${levelName(f.level, f.attitude)}`,
    `- **Approval (AR):** ${kc.ar}${kc.stressed ? ' · Stressed' : ''}${kc.pleased ? ' · Pleased' : ''}${f.hunted ? ' · **Hunting you**' : ''}${f.rebellion ? ' · **Rebellion**' : ''}`,
    kc.quest.name ? `- **Faction quest:** ${kc.quest.name} (${kc.quest.done}/3)` : '',
    '',
  ];
  if (ties.length) {
    lines.push('## Ties');
    for (const p of ties) {
      const o = state.factions.find((x) => x.id === (p.a === f.id ? p.b : p.a));
      lines.push(`- ${o ? `[[${safeName(o.name)}]]` : '?'}: ${p.attitude > 0 ? '+' : ''}${p.attitude} ${levelName('ties', p.attitude)}`);
    }
    lines.push('');
  }
  if (f.notes) lines.push('## Notes', f.notes, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** One note with everything: NPCs, factions, threads, tracks, chaos. */
export function overviewNote() {
  const c = activeCampaign();
  const m = state.mythic;
  const lists = state.trackers.lists;
  const threads = lists.find((l) => l.id === 'mythic-threads')?.items || [];
  const people = state.npcs.filter((n) => !n.archived).sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    '---', 'tabletop-kit: overview', `campaign: ${yamlStr(c?.name)}`, `game: ${yamlStr(c?.game)}`,
    `chaos: ${m.chaos}`, `scene: ${m.scene || 0}`, `updated: ${today()}`, '---',
    `# ${c?.name || 'Campaign'}`, '', OWNED('overview'), '',
    c?.notes ? `${c.notes}\n` : '',
    '## Mythic', `- **Chaos Factor:** ${m.chaos}`, `- **Scene:** ${m.scene || 0}`, '',
    '### Threads', ...(threads.length ? [...new Set(threads.map((t) => t.text))].map((t) => `- ${t}`) : ['- (none)']), '',
  ];
  if (m.tracks?.length) {
    lines.push('### Thread Progress Tracks');
    for (const t of m.tracks) lines.push(`- ${t.thread}: ${t.points}/${t.length}${t.done ? ' ✓ concluded' : t.paused ? ' (minimized)' : ''}`);
    lines.push('');
  }
  lines.push('## NPCs', '| NPC | Role | Attitude | Type | AR |', '| --- | --- | --- | --- | --- |');
  for (const n of people) {
    const kc = ensureKc(n);
    lines.push(`| [[${safeName(n.name)}]] | ${(n.role || '').replace(/\|/g, '/')} | ${n.attitude > 0 ? '+' : ''}${n.attitude} ${levelName(kc.stage, n.attitude)} | ${kc.stage} | ${kc.ar}${kc.stressed ? ' S' : ''}${kc.pleased ? ' P' : ''} |`);
  }
  lines.push('');
  if (state.factions.length) {
    lines.push('## Factions', '| Faction | Standing | Level | AR |', '| --- | --- | --- | --- |');
    for (const f of state.factions) lines.push(`| [[${safeName(f.name)}]] | ${f.level} | ${f.attitude > 0 ? '+' : ''}${f.attitude} ${levelName(f.level, f.attitude)} | ${ensureKc(f).ar} |`);
    lines.push('');
  }
  const counters = state.trackers.counters;
  if (counters.length) { lines.push('## Counters', ...counters.map((x) => `- ${x.name}: ${x.value}${x.max != null ? ` / ${x.max}` : ''}`), ''); }
  const other = lists.filter((l) => !l.id.startsWith('mythic-'));
  for (const l of other) lines.push(`## ${l.name}`, ...(l.items.length ? l.items.map((i) => `- ${i.text}`) : ['- (empty)']), '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------
// "Changed since sent" bookkeeping
// ---------------------------------------------------------------
export const needsSend = (h) => !h.sentAt || (h.updatedAt || 0) > h.sentAt;
export function markSent(h) { h.sentAt = Date.now(); }

// ---------------------------------------------------------------
// ZIP export of the whole campaign as notes (stored, no compression)
// A tiny ZIP writer so the app needs no libraries.
// ---------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ path: 'NPC/Marta.md', text }] → Blob (application/zip) */
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** Every app-owned note for this campaign, plus the log as Markdown. */
export function campaignFiles(logMarkdown) {
  const v = vault();
  const files = [{ path: `${cleanPath(v.overviewNote) || 'Campaign Overview'}.md`, text: overviewNote() }];
  for (const n of state.npcs) files.push({ path: `${npcPath(n)}.md`, text: npcNote(n) });
  for (const f of state.factions) files.push({ path: `${factionPath(f)}.md`, text: factionNote(f) });
  if (logMarkdown) files.push({ path: `${cleanPath(v.logMode === 'file' ? v.logNote : 'Sessions/Session Log') || 'Session Log'} (export).md`, text: logMarkdown });
  return files;
}
