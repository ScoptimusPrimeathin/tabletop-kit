// =============================================================
// views/npcs.js — the NPC hub screen
// Screens: list → card → talk (Let's Talk dialogue)
// =============================================================

import { state, ui, save, emit } from '../state.js';
import {
  ATTITUDES, RELATIONSHIPS, attitudeName, relationshipOf, newNpc, getNpc, addNpc, updateNpc,
  deleteNpc, inMythic, addToMythic, removeFromMythic, syncCharacters,
} from '../npcs.js';
import * as LT from '../letstalk.js';
import { TONES, REACTIONS, MOOD_EFFECTS, ALL_MOODS, BASE_TONES, LEVEL_NAMES, CREDIT } from '../data/letstalk.js';
import * as UNE from '../une.js';
import * as KC from '../keepingcontact.js';
import { levelName, FIRST_IMPRESSIONS, BACKSTORIES, CREDIT as KC_CREDIT } from '../data/keepingcontact.js';
import { rollDie } from '../rng.js';
import * as OB from '../obsidian.js';
import { toMarkdown, currentSession } from '../log.js';
import { STYLES, nameSettings, saveNameSettings, randomNames } from '../names.js';
import { visibleTables, folderPaths } from '../tables.js';
import { addLog } from '../log.js';
import { esc, toast, sheet, closeSheet, askConfirm } from '../ui.js';

export const title = 'NPCs';

export function render() {
  syncCharacters();
  if (ui.drafts.npcTalk && state.dialogue) return renderTalk();
  const open = ui.drafts.npcOpen && getNpc(ui.drafts.npcOpen);
  if (open) return renderCard(open);
  const sub = ui.drafts.npcSub || 'people';
  return `
  <div class="segmented">${[['people', 'People'], ['relations', 'Relations'], ['factions', 'Factions']].map(([id, l]) =>
    `<button class="${sub === id ? 'on' : ''}" data-act="npcSub" data-sub="${id}">${l}</button>`).join('')}</div>
  ${ui.results.kcUpdate ? `<section class="card result-card"><h3>Relationships updated</h3>${ui.results.kcUpdate.length
    ? ui.results.kcUpdate.map((r) => `<p class="small"><b>${esc(r.name)}</b>${r.roll ? ` (d6 ${r.roll})` : ''}: ${esc(r.text)}</p>`).join('')
    : '<p class="muted small">Nothing was Stressed or Pleased, so nothing changed.</p>'}</section>` : ''}
  ${sub === 'relations' ? renderRelations() : sub === 'factions' ? renderFactions() : renderList()}
  <section class="card">
    <h3>Obsidian vault <span class="muted small">(${esc(OB.vault().name || 'Settings default')})</span></h3>
    <p class="muted small">${changedCount()} card${changedCount() === 1 ? '' : 's'} changed since last sent.</p>
    <div class="row spread">
      <button data-act="sendOverview">↗ Send Campaign Overview</button>
      <button data-act="zipCampaign">⇩ All notes as .zip</button>
    </div>
    <p class="muted small">The overview is one note with every NPC, faction, thread and counter: one tap keeps the vault current.
      The .zip holds every NPC/faction note for unzipping into your vault (Files app) when you want them all at once.</p>
  </section>
  <section class="card">
    <button class="wide" data-act="kcUpdate">⟳ Update relationships</button>
    <p class="muted small">Do this at natural pauses (making camp, long travel, a time skip), about twice a session. Only Stressed or Pleased relationships can change. ${esc(KC_CREDIT)}</p>
  </section>`;
}

const attBadge = (v) => `<span class="att att${v}">${esc(attitudeName(v))}</span>`;

// ---------------------------------------------------------------
// LIST
// ---------------------------------------------------------------
function renderList() {
  const q = (ui.drafts.npcSearch || '').toLowerCase();
  const showArchived = !!ui.drafts.npcArchived;
  const list = state.npcs
    .filter((n) => !!n.archived === showArchived)
    .filter((n) => !q || `${n.name} ${n.role} ${n.une.modifier} ${n.une.noun}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `
  ${state.dialogue ? `<section class="card notice">💬 Conversation in progress with <b>${esc(getNpc(state.dialogue.npcId)?.name || '?')}</b>.
    <button data-act="resumeTalk">Resume</button></section>` : ''}
  <section class="card">
    <div class="row">
      <input type="search" placeholder="Search NPCs" data-draft="npcSearch" data-rerender value="${esc(ui.drafts.npcSearch || '')}">
      <button class="primary" data-act="newNpc">＋ New</button>
    </div>
    <div class="row spread">
      <button data-act="generate">🎲 Generate NPC (UNE)</button>
      <button data-act="toggleArchived">${showArchived ? '← Active NPCs' : `🗄 Archived (${state.npcs.filter((n) => n.archived).length})`}</button>
    </div>
    ${list.length ? list.map((n) => `
      <button class="npc-row" data-act="openNpc" data-id="${n.id}">
        <span class="npc-name">${esc(n.name)}${inMythic(n.id) ? ' <span class="muted small">🌀</span>' : ''}${n.sentAt && OB.needsSend(n) ? ' <span class="changed" title="Changed since last sent to Obsidian">•</span>' : ''}</span>
        <span class="muted small">${esc(n.role || [n.une.modifier, n.une.noun].filter(Boolean).join(' '))}</span>
        ${attBadge(n.attitude)}
      </button>`).join('') : `<p class="muted small">${showArchived ? 'No archived NPCs.' : 'No NPCs yet. Characters you add on Mythic → Lists show up here too.'}</p>`}
  </section>
  <section class="card">
    <div class="row spread"><button data-act="socialSetup">💬 Conversation options</button><button data-act="uneSetup">⚙︎ UNE setup</button></div>
    <p class="muted small">🌀 = on Mythic's Characters list. ${esc(CREDIT)}</p>
  </section>`;
}

// ---------------------------------------------------------------
// CARD
// ---------------------------------------------------------------
function renderCard(n) {
  const res = ui.results.npcs;
  const u = n.une;
  return `
  <div class="row"><button data-act="back">← All NPCs</button></div>
  ${res && res.npcId === n.id ? `<section class="card result-card">${res.html}</section>` : ''}
  <section class="card">
    <label>Name
      <div class="row"><input type="text" data-npcfield="name" value="${esc(n.name)}">
      <button class="icon-btn" data-act="nameGen" title="Random name">🎲</button></div></label>
    <label>Role / short description <input type="text" data-npcfield="role" value="${esc(n.role)}" placeholder="e.g. Village herbalist"></label>
    <label>Attitude toward you
      <div class="row"><select data-npcfield="attitude">${ATTITUDES.map((a) => `<option value="${a.v}" ${n.attitude === a.v ? 'selected' : ''}>${a.v > 0 ? '+' : ''}${a.v} ${a.name}</option>`).join('')}</select>
      <button class="icon-btn" data-act="kcFirstImpression" title="Check your hunch (1d6) and roll a first impression">🎲</button></div></label>
    <div class="row spread">
      <button data-act="talk" class="primary">💬 Talk (Let's Talk)</button>
      <button data-act="mythicToggle">${inMythic(n.id) ? '🌀 Remove from Mythic list' : '🌀 Add to Mythic Characters'}</button>
    </div>
    <div class="row spread">
      <button data-act="sendNpc">↗ ${OB.needsSend(n) ? 'Update' : 'Send'} note in Obsidian${OB.needsSend(n) && n.sentAt ? ' •' : ''}</button>
      <span class="muted small">${esc(OB.npcPath(n))}</span>
    </div>
  </section>

  <section class="card">
    <h3>Profile <span class="muted small">(UNE)</span></h3>
    <div class="row"><input type="text" data-npcune="modifier" value="${esc(u.modifier)}" placeholder="Modifier">
      <input type="text" data-npcune="noun" value="${esc(u.noun)}" placeholder="Noun">
      <button class="icon-btn" data-act="uneIdentity" title="Roll modifier + noun">🎲</button></div>
    <div class="row"><input type="text" data-npcune="power" value="${esc(u.power)}" placeholder="Power vs. you">
      <select data-draft="uneR">${UNE.R_LEVELS.map((r) => `<option ${ (ui.drafts.uneR || 'standard') === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <button class="icon-btn" data-act="unePower" title="Roll power level">🎲</button></div>
    <label>Motivations <button class="icon-btn" data-act="uneMotives" title="Roll 3 motivations">🎲</button>
      <textarea rows="3" data-npcfield="motivationsText" placeholder="One per line">${esc(u.motivations.join('\n'))}</textarea></label>
    <label>Relationship (for UNE conversation mood)
      <select data-npcfield="relationship"><option value="">Match attitude (${esc(relationshipOf({ ...n, relationship: '' }))})</option>
        ${RELATIONSHIPS.map((r) => `<option value="${r}" ${n.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="row spread">
      <button data-act="uneMood">🎭 Conversation mood</button>
      <button data-act="uneDiscuss">🗣 What do they want to discuss?</button>
    </div>
  </section>

  ${renderKc(n)}

  <section class="card">
    <h3>Personality & notes</h3>
    <label>Personality mood <span class="muted small">(optional; used when you start a talk with "personality")</span>
      <select data-npcfield="mood"><option value="">— none —</option>${ALL_MOODS.map((m) => `<option ${n.mood === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    ${n.flirtCooldown ? '<p class="small">😚 Flirting was used recently. <button data-act="clearCooldown" data-key="flirtCooldown">Allow again</button></p>' : ''}
    ${n.romanceCooldown ? '<p class="small">🥰 Romantic tone used recently. <button data-act="clearCooldown" data-key="romanceCooldown">Allow again</button></p>' : ''}
    <label>Notes <textarea rows="4" data-npcfield="notes">${esc(n.notes)}</textarea></label>
    <div class="row spread">
      <button data-act="archiveNpc">${n.archived ? '↩︎ Unarchive' : '🗄 Archive'}</button>
      <button class="danger" data-act="deleteNpc">Delete</button>
    </div>
  </section>`;
}

// ---------------------------------------------------------------
// KEEPING CONTACT on a card (also reused for factions)
// ---------------------------------------------------------------
function kindOf(h) { return h.level ? h.level : KC.ensureKc(h).stage; }

function arBar(h) {
  const kc = KC.ensureKc(h);
  const [min, max] = KC.limits(h);
  const cells = [];
  for (let v = min; v <= max; v++) cells.push(`<span class="arcell ${v === kc.ar ? 'on' : ''} ${v === 0 ? 'zero' : ''}">${v > 0 ? '+' + v : v}</span>`);
  return `<div class="arbar">${cells.join('')}</div>`;
}

function renderKc(h, isFaction = false) {
  const kc = KC.ensureKc(h);
  const kind = kindOf(h);
  const tag = isFaction ? 'f' : 'n';
  const why = (fn) => (fn ? fn(h) : '');
  const bondWhy = KC.canCreateBond(h), romWhy = isFaction ? 'x' : KC.canStartRomance(h);
  const label = isFaction ? { outsider: 'Reputation', member: 'Status', leader: 'Leadership' }[h.level] : 'Attitude';
  return `
  <section class="card">
    <h3>Relationship <span class="muted small">(Keeping Contact)</span></h3>
    <p><b>${esc(label)} ${h.attitude > 0 ? '+' : ''}${h.attitude}: ${esc(levelName(kind, h.attitude))}</b>
      <span class="muted small">· ${esc({ default: 'Default', bond: 'Bond', romance: 'Romance', outsider: 'Outsider', member: 'Member', leader: 'Leader' }[kind])}</span>
      ${kc.stressed ? ' <span class="att att-1">Stressed</span>' : ''}${kc.pleased ? ' <span class="att att2">Pleased</span>' : ''}
      ${kc.foe ? ' <span class="att att-2">Foe</span>' : ''}${h.hunted ? ' <span class="att att-2">Hunting you</span>' : ''}${h.rebellion ? ' <span class="att att-2">Rebellion</span>' : ''}</p>
    <div class="muted small">Approval rating (AR)</div>${arBar(h)}
    <div class="row spread">
      <select data-kcapprove="${tag}"><option value="">They approve…</option>
        <option value="slight">a little</option><option value="lot">a lot</option><option value="favor">a great favour</option><option value="lifetime">once-in-a-lifetime favour</option></select>
      <select data-kcdisapprove="${tag}"><option value="">They disapprove…</option>
        <option value="slight">a little</option><option value="clear">angered / saddened</option><option value="harm">great harm</option><option value="betrayal">betrayal</option></select>
    </div>
    <div class="row spread">
      ${kind === 'default' || kind === 'outsider' ? `<button data-act="kcBond" data-t="${tag}" ${bondWhy ? 'disabled' : ''} title="${esc(bondWhy)}">${isFaction ? '🤝 Join (Bond)' : '🤝 Create Bond'}</button>` : ''}
      ${kind === 'bond' ? `<button data-act="kcRomance" data-t="${tag}" ${romWhy ? 'disabled' : ''} title="${esc(romWhy)}">💞 Start romance</button>` : ''}
      ${kind === 'bond' || kind === 'member' || kind === 'leader' ? `<button data-act="kcBreak" data-t="${tag}">💔 ${isFaction ? 'Leave' : 'Break Bond'}</button>` : ''}
      ${kind === 'romance' ? '<button data-act="kcEndRomance">💔 End romance</button>' : ''}
      ${kind === 'member' ? `<button data-act="kcLeader" data-t="${tag}">👑 Become leader</button>` : ''}
      ${!isFaction ? '<button data-act="kcAsk">🙏 Ask for something</button>' : ''}
    </div>
    ${bondWhy && (kind === 'default' || kind === 'outsider') ? `<p class="muted small">Bond: ${esc(bondWhy)}.</p>` : ''}
    ${kind === 'bond' && romWhy ? `<p class="muted small">Romance: ${esc(romWhy)}.</p>` : ''}
    ${kind !== 'default' && kind !== 'outsider' && !isFaction ? `<div class="row spread"><span class="small">Their courage on a reroll:</span>
      <button data-act="kcCourage" data-r="fail">Still failed (−1 AR)</button><button data-act="kcCourage" data-r="crit">Critical (+1 AR)</button></div>` : ''}
    ${h.rebellion ? `<div class="row spread"><button data-act="kcRebel" data-r="deposed">Deposed</button><button data-act="kcRebel" data-r="stepdown">Step down</button><button data-act="kcRebel" data-r="won">Won them back</button></div>` : ''}
    <h3>${isFaction ? 'Faction' : 'Personal'} quest</h3>
    <div class="row"><input type="text" data-kcquest="${tag}" value="${esc(kc.quest.name)}" placeholder="What they need help with">
      <span class="small">${kc.quest.done}/3</span></div>
    <div class="row spread">
      <button data-act="kcQuest" data-t="${tag}" ${kc.quest.done >= 3 ? 'disabled' : ''}>✓ Stage done</button>
      <button data-act="kcNag" data-t="${tag}">Neglected it (−1 AR)</button>
      <select data-kcfail="${tag}"><option value="">You failed it…</option><option value="harm">by negligence (great harm)</option><option value="betrayal">on purpose (betrayal)</option></select>
    </div>
    <details class="help"><summary>Manual adjustments</summary>
      <div class="row"><span class="small">AR</span><button data-act="kcAr" data-t="${tag}" data-d="-1">−1</button><button data-act="kcAr" data-t="${tag}" data-d="1">+1</button>
        <label class="toggle small"><input type="checkbox" data-kccond="${tag}:stressed" ${kc.stressed ? 'checked' : ''}> Stressed</label>
        <label class="toggle small"><input type="checkbox" data-kccond="${tag}:pleased" ${kc.pleased ? 'checked' : ''}> Pleased</label></div>
      ${!isFaction ? `<label>Relationship type <select data-kcstage="n">${['default', 'bond', 'romance'].map((st) => `<option ${kc.stage === st ? 'selected' : ''}>${st}</option>`).join('')}</select></label>` : ''}
      ${kc.bondCooldown || kc.romanceCooldown || kc.noImprove ? `<button data-act="kcClear" data-t="${tag}">Clear cooldowns${kc.noImprove ? ' (and hurt feelings)' : ''}</button>` : ''}
    </details>
  </section>`;
}

// ---------------------------------------------------------------
// RELATIONS (NPC ↔ NPC)
// ---------------------------------------------------------------
function renderRelations() {
  const people = state.npcs.filter((n) => !n.archived);
  const opts = (sel) => `<option value="pc" ${sel === 'pc' ? 'selected' : ''}>You</option>` + people.map((n) => `<option value="${n.id}" ${sel === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('');
  const pairs = state.relations.filter((p) => p.kind === 'npc');
  return `
  <section class="card">
    <h3>Between characters</h3>
    <p class="muted small">How two characters get along with each other (your own relationships live on each NPC card).</p>
    ${pairs.map((p) => {
      const kc = KC.ensureKc(p);
      return `<div class="pair">
        <div class="row spread"><b>${esc(KC.pairName(p))}</b><span>${attBadge(p.attitude)} <span class="small">${esc(levelName(kc.stage, p.attitude))}</span>
          ${kc.stressed ? '<span class="att att-1">Stressed</span>' : ''}${kc.pleased ? '<span class="att att2">Pleased</span>' : ''}${kc.crush ? `<span class="att att2">crush: ${esc(kc.crush)}</span>` : ''}</span></div>
        <div class="muted small">AR ${kc.ar > 0 ? '+' : ''}${kc.ar}${kc.nextMod ? ` · next roll ${kc.nextMod > 0 ? '+' : ''}${kc.nextMod}` : ''}</div>
        <div class="chip-row">
          ${['intimacy', 'polite', 'argument'].map((a) => `<button class="chip" data-act="kcPair" data-id="${p.id}" data-a="${a}">${esc(KC.PAIR_ACTIONS[a])}</button>`).join('')}
          <button class="chip" data-act="kcPairAtt" data-id="${p.id}" data-d="-1">−</button><button class="chip" data-act="kcPairAtt" data-id="${p.id}" data-d="1">＋</button>
          <button class="chip" data-act="kcPairStage" data-id="${p.id}">${kc.stage === 'romance' ? 'Romance' : kc.stage === 'bond' ? 'Bond' : 'Default'} ↻</button>
          <button class="chip" data-act="kcPairDel" data-id="${p.id}">✕</button>
        </div></div>`;
    }).join('') || '<p class="muted small">No pairs yet.</p>'}
  </section>
  <section class="card">
    <h3>Add a pair</h3>
    <div class="row"><select id="pair-a">${opts(people[0]?.id)}</select><select id="pair-b">${opts(people[1]?.id || 'pc')}</select></div>
    <div class="row"><select id="pair-att">${ATTITUDES.map((a) => `<option value="${a.v}" ${a.v === 0 ? 'selected' : ''}>${a.v > 0 ? '+' : ''}${a.v}</option>`).join('')}</select>
      <button data-act="kcPairAdd">＋ Add</button><button data-act="kcPairRandom">🎲 Deal two</button></div>
    <p class="muted small">"Deal two" picks two characters at random (you included), like shuffling character cards, and rolls their backstory if they're new.</p>
  </section>`;
}

// ---------------------------------------------------------------
// FACTIONS
// ---------------------------------------------------------------
function renderFactions() {
  const open = ui.drafts.factionOpen && state.factions.find((f) => f.id === ui.drafts.factionOpen);
  if (open) {
    const ties = state.relations.filter((p) => p.kind === 'ties' && (p.a === open.id || p.b === open.id));
    return `
    <div class="row"><button data-act="factionBack">← All factions</button></div>
    <section class="card"><label>Name <input type="text" data-faction="name" value="${esc(open.name)}"></label>
      <label>Notes <textarea rows="2" data-faction="notes">${esc(open.notes)}</textarea></label>
      <div class="row spread"><button data-act="sendFaction">↗ ${OB.needsSend(open) ? 'Update' : 'Send'} note in Obsidian</button>
        <span class="muted small">${esc(OB.factionPath(open))}</span></div></section>
    ${renderKc(open, true)}
    <section class="card"><h3>Ties with other factions</h3>
      ${ties.map((p) => { const kc = KC.ensureKc(p); const other = KC.nameOf(p.a === open.id ? p.b : p.a);
        return `<div class="pair"><div class="row spread"><b>${esc(other)}</b><span class="small">${p.attitude > 0 ? '+' : ''}${p.attitude} ${esc(levelName('ties', p.attitude))} · AR ${kc.ar}</span></div>
        <div class="chip-row">${['entente', 'mutual', 'heads'].map((a) => `<button class="chip" data-act="kcPair" data-id="${p.id}" data-a="${a}">${esc(KC.PAIR_ACTIONS[a])}</button>`).join('')}
          <button class="chip" data-act="kcPairAtt" data-id="${p.id}" data-d="-1">−</button><button class="chip" data-act="kcPairAtt" data-id="${p.id}" data-d="1">＋</button>
          <button class="chip" data-act="kcPairDel" data-id="${p.id}">✕</button></div></div>`; }).join('') || '<p class="muted small">No ties yet.</p>'}
      <div class="row"><select id="tie-b">${state.factions.filter((f) => f.id !== open.id).map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>
        <select id="tie-att">${ATTITUDES.map((a) => `<option value="${a.v}" ${a.v === 0 ? 'selected' : ''}>${a.v > 0 ? '+' : ''}${a.v} ${esc(levelName('ties', a.v))}</option>`).join('')}</select>
        <button data-act="kcTieAdd">＋</button></div>
      <label class="toggle small"><input type="checkbox" data-act="kcSides" ${ui.drafts.kcSides !== false ? 'checked' : ''}> Choosing sides: helping this faction annoys its enemies (Ties −2)</label>
    </section>`;
  }
  return `
  <section class="card">
    <div class="row"><input type="text" placeholder="New faction name" data-draft="newFaction" value="${esc(ui.drafts.newFaction || '')}" data-enter="factionAdd">
      <button class="primary" data-act="factionAdd">＋ Add</button></div>
    ${state.factions.map((f) => `<button class="npc-row" data-act="factionOpen" data-id="${f.id}">
      <span class="npc-name">${esc(f.name)}</span>
      <span class="muted small">${esc({ outsider: 'Outsider', member: 'Member', leader: 'Leader' }[f.level])} · ${esc(levelName(f.level, f.attitude))}${f.hunted ? ' · hunting you' : ''}</span>
      ${attBadge(f.attitude)}</button>`).join('') || '<p class="muted small">No factions yet: guilds, cults, kingdoms, crews…</p>'}
  </section>`;
}

// ---------------------------------------------------------------
// TALK (Let's Talk)
// ---------------------------------------------------------------
function renderTalk() {
  const dl = state.dialogue;
  const n = getNpc(dl.npcId);
  const eff = MOOD_EFFECTS[dl.mood.name];
  const forced = !dl.ended && LT.forcedTone();
  const choice = ui.drafts.ltChoice; // pending "pick the reaction"
  return `
  <div class="row"><button data-act="leaveTalk">← ${esc(n?.name || 'NPC')}</button></div>
  <section class="card">
    <h3>💬 ${esc(n?.name || 'NPC')}</h3>
    <p class="small">${attBadge(dl.attitude)} · <b>Mood:</b> ${esc(dl.mood.name)}${dl.mood.rolls ? ` <span class="muted">(${esc(dl.mood.rolls)})</span>` : ''}
      · <b>Topic:</b> ${esc(dl.topic.text)}${dl.topic.roll ? ` <span class="muted">(d10 ${dl.topic.roll})</span>` : ''}</p>
    ${dl.options.advancedMoods && eff ? `<p class="interp small">${esc(dl.mood.name)}: ${esc(eff.text)}${LT.effectActive() ? '' : ' <i>(not active right now)</i>'}</p>` : ''}
  </section>

  ${dl.history.map((h) => `<section class="card exch">
    <div class="muted small">Exchange ${h.n}</div>
    <div>${TONES[h.tone]?.icon || ''} You: <b>${esc(h.tone)}</b>${h.card === 'Wildcard' ? ' (Wildcard)' : ''}${h.lie ? ' · lying' : ''}</div>
    <div class="answer">${REACTIONS[h.reaction]?.icon || ''} ${esc(h.reaction)}</div>
    <div class="muted small">${esc(LEVEL_NAMES[h.level])}${h.roll != null ? ` · d10 ${h.roll}` : ''}${h.mod ? ` · attitude ${h.mod > 0 ? '+' : ''}${h.mod}` : ''}</div>
    <p class="small">${esc(REACTIONS[h.reaction]?.hint || '')}</p>
    ${h.notes.length ? `<p class="muted small">${h.notes.map(esc).join(' · ')}</p>` : ''}
  </section>`).join('')}

  ${dl.ended ? renderAftermath(dl, n) : choice ? `
  <section class="card notice"><h3>Pick the reaction</h3>
    ${choice.options.map((o) => `<button class="wide" data-act="ltChoose" data-level="${o.level}">${REACTIONS[o.reaction]?.icon || ''} ${esc(o.reaction)} <span class="muted small">(${esc(LEVEL_NAMES[o.level])})</span></button>`).join('')}
  </section>` : `
  <section class="card">
    <h3>Exchange ${dl.exchange}: choose your tone</h3>
    ${forced ? `<p class="warn small">Wildcard + ${esc(forced)} drawn together: you must use ${esc(forced)}, and you pick the reaction.</p>` : ''}
    <div class="tones">${dl.hand.map((c) => {
      const why = LT.unusableReason(c);
      const tone = c === 'Wildcard' ? dl.options.wildcard : c;
      const mod = why ? 0 : LT.modifierFor(tone);
      return `<button class="tone ${why ? 'off' : ''}" data-act="ltPlay" data-card="${esc(c)}" ${why || (forced && tone !== forced) ? 'disabled' : ''}>
        <span class="ticon">${TONES[tone]?.icon || '🃏'}</span><b>${esc(c === 'Wildcard' ? `Wildcard (${tone})` : c)}</b>
        ${mod ? `<span class="small">attitude ${mod > 0 ? '+' : ''}${mod}</span>` : ''}
        <span class="small muted">${esc(why || TONES[tone]?.hint || '')}</span></button>`;
    }).join('')}</div>
    ${!LT.anyUsable() && !forced ? `<p class="warn small">No usable tone.</p>
      ${dl.options.hardcore ? `<p class="small">Hardcore: discard one and draw another:</p>${dl.hand.map((c) => `<button data-act="ltRedraw" data-card="${esc(c)}">Swap ${esc(c)}</button>`).join(' ')}` : ''}
      <button class="wide" data-act="ltPlay" data-card="Err…hmm">🤔 Err…hmm</button>` : ''}
    <label class="toggle"><input type="checkbox" data-act="ltLie" ${ui.drafts.ltLie ? 'checked' : ''}> I'm lying in this exchange</label>
    <div class="row spread"><span class="muted small">${dl.deck.length} cards left in the deck${dl.options.hardcore ? ' · Hardcore' : ''}</span>
      <button data-act="ltEnd">End conversation</button></div>
  </section>`}`;
}

function renderAftermath(dl, n) {
  const p = ui.drafts.ltPersuade;
  return `
  <section class="card">
    <h3>Aftermath</h3>
    <p class="small">${esc(dl.endReason)}</p>
    <p class="small">Did anything said (or done) change the relationship? Hurtful words sour things quickly, while kind words alone rarely improve them.</p>
    ${n ? `<div class="row spread">
      <select data-kcapprove="talk"><option value="">They approved…</option><option value="slight">a little</option><option value="lot">a lot</option></select>
      <select data-kcdisapprove="talk"><option value="">They disapproved…</option><option value="slight">a little</option><option value="clear">angered / saddened</option></select>
    </div><p class="muted small">AR ${KC.ensureKc(n).ar > 0 ? '+' : ''}${n.kc.ar}${n.kc.stressed ? ' · Stressed' : ''}${n.kc.pleased ? ' · Pleased' : ''} · ${attBadge(n.attitude)}</p>` : ''}
    <h3>Asking for something?</h3>
    <p class="small muted">A final check against their attitude. Adjust for how the conversation went.</p>
    <div class="row spread">
      <button data-act="ltPersuade" data-adj="-1">It went badly</button>
      <button data-act="ltPersuade" data-adj="0">So-so</button>
      <button data-act="ltPersuade" data-adj="1">It went well</button>
    </div>
    ${p ? `<p class="answer">${esc(p.answer)}</p><p class="muted small">d10 ${p.roll} vs ${esc(attitudeName(p.attitude))}</p>` : ''}
    ${n && !n.mood ? `<button class="wide" data-act="ltKeepMood">Keep "${esc(dl.mood.name)}" as their personality mood</button>` : ''}
    <button class="primary wide" data-act="ltFinish">Done: log it and close</button>
  </section>`;
}

// ---------------------------------------------------------------
// Sheets: start talk, UNE setup, social options
// ---------------------------------------------------------------
function openStartTalk(n) {
  const el = sheet(`Talk with ${n.name}`, `
    <p class="small">${attBadge(n.attitude)} ${n.attitude <= -2 ? 'If they hate you too much to talk at all, expect insults, attacks or flight instead.' : ''}</p>
    <label>Who starts the conversation?
      <select id="lt-who"><option value="you">You: I pick the topic</option><option value="npc">They do: roll the topic</option></select></label>
    <input type="text" id="lt-topic" placeholder="Your topic (e.g. ask about the missing herbs)">
    <label>Their mood
      <select id="lt-mood">
        <option value="random">Roll (random mood)</option>
        <option value="attitude">Roll based on their attitude</option>
        ${n.mood ? `<option value="personality">Their personality mood (${esc(n.mood)})</option>` : ''}
        <option value="pick">Choose one…</option>
      </select></label>
    <select id="lt-pick" style="display:none">${ALL_MOODS.map((m) => `<option>${m}</option>`).join('')}</select>
    <button class="primary wide" data-start="go">Start</button>`);
  const who = el.querySelector('#lt-who'), topic = el.querySelector('#lt-topic');
  const mood = el.querySelector('#lt-mood'), pick = el.querySelector('#lt-pick');
  who.addEventListener('change', () => { topic.style.display = who.value === 'you' ? '' : 'none'; });
  mood.addEventListener('change', () => { pick.style.display = mood.value === 'pick' ? '' : 'none'; });
  el.querySelector('[data-start]').addEventListener('click', () => {
    const dl = LT.startDialogue(n.id, {
      topic: { by: who.value, text: topic.value.trim() },
      mood: { method: mood.value, name: pick.value },
    });
    closeSheet();
    ui.drafts.npcTalk = true; ui.drafts.ltChoice = null; ui.drafts.ltLie = false; ui.drafts.ltPersuade = null;
    addLog('npc', `Talk with ${n.name}: ${dl.mood.name} mood`, `Attitude ${attitudeName(dl.attitude)} · Topic: ${dl.topic.text}`);
    emit();
  });
}

function openUneSetup() {
  const opts = (sel) => '<option value="">(auto by name)</option>' + visibleTables()
    .slice().sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name))
    .map((t) => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.folder)} › ${esc(t.name)}</option>`).join('');
  const el = sheet('UNE setup', `
    <p class="small">UNE's tables come from your copy of the book. Paste them with <b>Tables → Bulk paste</b> (e.g. folder <code>UNE</code>).
      If you name the tables like the slots below (e.g. <code># NPC Modifier</code>, <code># Mood: Friendly</code>, <code># Bearing: Scheming</code>),
      they're linked automatically. Otherwise pick each one here.</p>
    <p class="small muted">Grid tables in the book (conversation mood, power level, bearing) become one small table per row: e.g. the
      "friendly" row of the mood table is its own table <code># Mood: Friendly</code> with lines like <code>1-2 withdrawn</code>.</p>
    <label>Look in folder <select id="une-folder"><option value="">All folders</option>${folderPaths().map((f) => `<option ${state.une.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    ${UNE.SLOTS.map((s) => {
      const t = UNE.slotTable(s.id);
      return `<label>${esc(s.label)}${s.optional ? ' <span class="muted small">(optional)</span>' : ''} ${t ? '✓' : '<span class="warn">missing</span>'}
        <select data-slot="${s.id}">${opts(state.une.slots[s.id])}</select></label>`;
    }).join('')}
    <button class="primary wide" data-une="save">Save</button>`);
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-une="save"]')) return;
    state.une.folder = el.querySelector('#une-folder').value;
    el.querySelectorAll('[data-slot]').forEach((s) => UNE.setSlot(s.dataset.slot, s.value));
    save('une'); closeSheet(); toast('UNE setup saved'); emit();
  });
}

function openAsk(n) {
  const kc = KC.ensureKc(n);
  const el = sheet(`Ask ${n.name} for something`, `
    <p class="small">For something reasonable that they have a reason to consider. Roll 2d6 + Attitude${kc.stage === 'romance' ? ' (+1 romance)' : ''}.</p>
    <label class="toggle"><input type="checkbox" id="ask-debt" ${kc.pleased && !kc.stressed ? '' : 'disabled'}> Call in a debt (+2; needs Pleased, not Stressed)</label>
    <label class="toggle"><input type="checkbox" id="ask-int" ${kc.stage === 'default' ? '' : 'disabled'}> Intimidate them (+2; Attitude −1 and Stressed; not with a Bond)</label>
    <label class="toggle"><input type="checkbox" id="ask-skill"> Use a social skill (+1, once per session)</label>
    <button class="primary wide" data-ask="go">Roll</button>`);
  el.querySelector('[data-ask]').addEventListener('click', () => {
    const r = KC.askFor(n, { debt: el.querySelector('#ask-debt').checked, intimidate: el.querySelector('#ask-int').checked, skill: el.querySelector('#ask-skill').checked });
    closeSheet();
    finishKc(n, `Asked ${n.name} for something: ${r.band === 'miss' ? 'No' : 'Yes'}`, r);
  });
}

// Random name picker: 6 suggestions, tap one to use it.
function openNames(n) {
  const ns = nameSettings();
  const tableOpts = visibleTables().slice().sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name))
    .map((t) => `<option value="${t.id}" ${ns.tableId === t.id ? 'selected' : ''}>${esc(t.folder)} › ${esc(t.name)}</option>`).join('');
  const el = sheet(`Name for ${n.name}`, `
    <div id="name-list" class="chip-row"></div>
    <button class="wide" data-nm="reroll">🎲 More names</button>
    <h3>Source <span class="muted small">(this campaign)</span></h3>
    <select id="nm-mode">
      <option value="builtin" ${ns.mode === 'builtin' ? 'selected' : ''}>Built-in generator</option>
      <option value="table" ${ns.mode === 'table' ? 'selected' : ''}>One of my tables (full names)</option>
      <option value="syllables" ${ns.mode === 'syllables' ? 'selected' : ''}>One of my tables, joined syllables</option>
    </select>
    <select id="nm-style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${ns.style === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <select id="nm-table"><option value="">Choose a table…</option>${tableOpts}</select>
    <div class="row" id="nm-parts"><span class="small">Syllables</span>
      <input type="number" class="narrow" id="nm-min" min="1" max="5" value="${ns.minParts || 2}"> to
      <input type="number" class="narrow" id="nm-max" min="1" max="5" value="${ns.maxParts || 3}"></div>`);
  const $ = (id) => el.querySelector(id);
  const sync = () => {
    const mode = $('#nm-mode').value;
    $('#nm-style').style.display = mode === 'builtin' ? '' : 'none';
    $('#nm-table').style.display = mode === 'builtin' ? 'none' : '';
    $('#nm-parts').style.display = mode === 'syllables' ? '' : 'none';
    saveNameSettings({ mode, style: $('#nm-style').value, tableId: $('#nm-table').value,
      minParts: +$('#nm-min').value || 2, maxParts: +$('#nm-max').value || 3 });
    const list = mode !== 'builtin' && !$('#nm-table').value ? [] : randomNames(6);
    $('#name-list').innerHTML = list.length
      ? list.map((x) => `<button class="chip" data-pick="${esc(x)}">${esc(x)}</button>`).join('')
      : '<p class="muted small">Choose a table below.</p>';
  };
  el.addEventListener('change', sync);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-nm="reroll"]')) sync();
    const p = e.target.closest('[data-pick]');
    if (p) { updateNpc(n.id, { name: p.dataset.pick }); closeSheet(); toast(`Named ${p.dataset.pick}`); }
  });
  sync();
}

function openSocialSetup() {
  const s = state.social;
  const el = sheet('Conversation options (this campaign)', `
    <label>Your Wildcard tone <span class="muted small">(a tone your PC leans on: one extra copy in the deck)</span>
      <select id="so-wild"><option value="">None</option>${[...BASE_TONES, 'Flirting', 'Romantic'].map((t) => `<option ${s.wildcard === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="toggle"><input type="checkbox" id="so-adv" ${s.advancedMoods ? 'checked' : ''}> Moods have mechanical effects (Advanced Moods)</label>
    <label class="toggle"><input type="checkbox" id="so-flirt" ${s.flirting ? 'checked' : ''}> Include the Flirting tone when allowed</label>
    <label class="toggle"><input type="checkbox" id="so-hard" ${s.hardcore ? 'checked' : ''}> Hardcore mode (only the 3 cards drawn at the start)</label>
    <label class="toggle"><input type="checkbox" id="so-port" ${s.porting !== false ? 'checked' : ''}> Keeping Contact porting: shifts past the end of the scale roll extra d10s</label>
    <label>Update relationships: how volatile?
      <select id="so-vol">${[[3, 'Normal (1–3 changes)'], [4, 'Volatile (1–4)'], [5, 'Very volatile (1–5)']].map(([v, l]) => `<option value="${v}" ${(s.volatility || 3) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="primary wide" data-so="save">Save</button>
    <p class="muted small">${esc(CREDIT)}</p>`);
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-so="save"]')) return;
    Object.assign(state.social, {
      wildcard: el.querySelector('#so-wild').value, advancedMoods: el.querySelector('#so-adv').checked,
      flirting: el.querySelector('#so-flirt').checked, hardcore: el.querySelector('#so-hard').checked,
      porting: el.querySelector('#so-port').checked, volatility: +el.querySelector('#so-vol').value,
    });
    save('social'); closeSheet(); toast('Saved'); emit();
  });
}

// ---------------------------------------------------------------
// Field edits on the card
// ---------------------------------------------------------------
export function onChange(el) {
  // Keeping Contact selects (cards, factions, the talk aftermath)
  const t = el.dataset.kcapprove || el.dataset.kcdisapprove || el.dataset.kcfail;
  if (t && el.value) {
    const h = holder(t);
    if (!h) return;
    const level = el.value;
    let r;
    if (el.dataset.kcapprove) {
      r = KC.approve(h, level);
      // Choosing sides: their enemies disapprove at the same level.
      if (h.level && ui.drafts.kcSides !== false && (level === 'slight' || level === 'lot')) {
        for (const enemy of KC.enemiesOf(h.id)) {
          const e = KC.disapprove(enemy, level === 'slight' ? 'slight' : 'clear');
          addLog('npc', `${enemy.name} disapproves (choosing sides): AR ${e.after}`, e.roll ? `d6 ${e.roll}` : '');
        }
      }
    } else r = KC.disapprove(h, level);
    finishKc(h, `${h.name} ${el.dataset.kcapprove ? 'approves' : 'disapproves'} (${el.selectedOptions[0].text})`, r);
    return;
  }
  if (el.dataset.kcquest) { const h = holder(el.dataset.kcquest); KC.ensureKc(h).quest.name = el.value.trim(); saveKc(); return; }
  if (el.dataset.kccond) { const [tg, cond] = el.dataset.kccond.split(':'); KC.ensureKc(holder(tg))[cond] = el.checked; saveKc(); emit(); return; }
  if (el.dataset.kcstage) { const h = holder('n'); KC.ensureKc(h).stage = el.value; KC.clampAr(h); saveKc(); emit(); return; }
  if (el.dataset.faction) { const f = holder('f'); f.updatedAt = Date.now(); f[el.dataset.faction] = el.dataset.faction === 'name' ? (el.value.trim() || f.name) : el.value; saveKc(); return; }
  const n = getNpc(ui.drafts.npcOpen);
  if (!n) return;
  if (el.dataset.npcfield) {
    const f = el.dataset.npcfield;
    if (f === 'attitude') updateNpc(n.id, { attitude: +el.value });
    else if (f === 'motivationsText') updateNpc(n.id, { une: { ...n.une, motivations: el.value.split('\n').map((x) => x.trim()).filter(Boolean) } });
    else updateNpc(n.id, { [f]: f === 'name' ? (el.value.trim() || n.name) : el.value });
  }
  if (el.dataset.npcune) updateNpc(n.id, { une: { ...n.une, [el.dataset.npcune]: el.value.trim() } });
  if (el.dataset.npccheck) updateNpc(n.id, { [el.dataset.npccheck]: el.checked });
}

const current = () => getNpc(ui.drafts.npcOpen);
const changedCount = () => [...state.npcs, ...state.factions].filter((h) => h.sentAt && OB.needsSend(h)).length;
/** The relationship holder a control refers to: 'n' card, 'f' faction, 'talk' the NPC being talked to. */
function holder(tag) {
  if (tag === 'f') return state.factions.find((f) => f.id === ui.drafts.factionOpen);
  if (tag === 'talk') return state.dialogue && getNpc(state.dialogue.npcId);
  return getNpc(ui.drafts.npcOpen);
}
function saveKc() { save('npcs', 'factions', 'relations'); }
function finishKc(h, title, r) {
  h.updatedAt = Date.now();
  const bits = [r.roll ? `d6 ${r.roll}` : '', r.dice?.length ? `2d6 [${r.dice.join('+')}]${r.mod ? ` ${r.mod > 0 ? '+' : ''}${r.mod}` : ''} = ${r.total}` : '',
    r.after !== undefined ? `AR ${r.before} → ${r.after}` : '', ...(r.notes || []), r.text || ''].filter(Boolean);
  addLog('npc', title, bits.join(' · '));
  ui.results.npcs = h.level ? null : { npcId: h.id, html: `<div class="answer small-answer">${esc(title)}</div><p class="small">${bits.map(esc).join('<br>')}</p>` };
  if (h.level) toast(bits.slice(-1)[0] || title);
  saveKc(); emit();
}
function show(n, html) { ui.results.npcs = { npcId: n.id, html }; emit(); }
function needUne(group) {
  const miss = UNE.missingSlots(group);
  if (miss.length) { toast(`UNE setup: missing ${miss.map((s) => s.label).slice(0, 2).join(', ')}${miss.length > 2 ? '…' : ''}`); return true; }
  return false;
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------
export const actions = {
  newNpc: () => {
    const n = addNpc(newNpc((ui.drafts.npcSearch || '').trim() || 'New NPC'));
    ui.drafts.npcOpen = n.id; ui.drafts.npcSearch = ''; emit();
  },
  generate: () => {
    if (needUne('modifier') || needUne('noun')) return;
    const id = UNE.rollIdentity();
    const motivations = UNE.slotTable('motVerb') && UNE.slotTable('motNoun') ? UNE.rollMotivations() : [];
    const p = UNE.rollPower('standard');
    const n = newNpc(`${cap(id.modifier)} ${id.noun}`.trim());
    n.une = { modifier: id.modifier, noun: id.noun, power: p?.text || '', motivations };
    addNpc(n);
    ui.drafts.npcOpen = n.id;
    addLog('npc', `New NPC: ${id.modifier} ${id.noun}`, [p ? `Power: ${p.text}` : '', ...motivations.map((m) => `Motivation: ${m}`)].filter(Boolean).join('\n'));
    show(n, `<div class="answer">${esc(id.modifier)} ${esc(id.noun)}</div>${p ? `<div class="muted small">${esc(p.text)}</div>` : ''}
      ${motivations.length ? `<p class="small">Wants to ${motivations.map(esc).join(', ')}.</p>` : ''}<p class="muted small">Rename them and decide the why behind each term.</p>`);
  },
  toggleArchived: () => { ui.drafts.npcArchived = !ui.drafts.npcArchived; emit(); },
  openNpc: (el) => { ui.drafts.npcOpen = el.dataset.id; ui.results.npcs = null; emit(); },
  back: () => { ui.drafts.npcOpen = null; emit(); },
  resumeTalk: () => { ui.drafts.npcTalk = true; emit(); },
  leaveTalk: () => { ui.drafts.npcTalk = false; ui.drafts.npcOpen = state.dialogue?.npcId; emit(); },
  socialSetup: () => openSocialSetup(),
  uneSetup: () => openUneSetup(),

  mythicToggle: () => {
    const n = current();
    if (inMythic(n.id)) { removeFromMythic(n.id); toast('Removed from Characters list'); }
    else if (addToMythic(n.id)) toast('Added to Mythic Characters'); else toast('Characters list is full (25)');
  },
  clearCooldown: (el) => updateNpc(current().id, { [el.dataset.key]: false }),
  archiveNpc: () => { const n = current(); updateNpc(n.id, { archived: !n.archived }); if (!n.archived) ui.drafts.npcOpen = null; emit(); },
  deleteNpc: async () => {
    const n = current();
    if (!(await askConfirm(`Delete ${n.name}? Their card is gone for good (Archive keeps it instead).`, 'Delete'))) return;
    deleteNpc(n.id); ui.drafts.npcOpen = null; emit();
  },

  nameGen: () => openNames(current()),

  // ----- Obsidian -----
  sendNpc: () => {
    const n = current();
    const link = OB.replaceURI(OB.npcPath(n), OB.npcNote(n));
    OB.markSent(n); save('npcs'); emit();
    OB.go(link);
  },
  sendFaction: () => {
    const f = holder('f');
    const link = OB.replaceURI(OB.factionPath(f), OB.factionNote(f));
    OB.markSent(f); save('factions'); emit();
    OB.go(link);
  },
  sendOverview: () => {
    const v = OB.vault();
    const link = OB.replaceURI(v.overviewNote || 'Campaign Overview', OB.overviewNote());
    OB.go(link);
  },
  zipCampaign: async () => {
    const files = OB.campaignFiles(toMarkdown(state.log));
    const blob = OB.makeZip(files);
    const name = `${OB.safeName(state.campaigns.list.find((c) => c.id === state.campaigns.active)?.name || 'Campaign')} notes.zip`;
    const file = new File([blob], name, { type: 'application/zip' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch { /* cancelled */ }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    const now = Date.now();
    [...state.npcs, ...state.factions].forEach((h) => { h.sentAt = now; });
    save('npcs', 'factions'); emit();
    toast(`${files.length} notes exported`);
  },

  // ----- Keeping Contact -----
  npcSub: (el) => { ui.drafts.npcSub = el.dataset.sub; ui.results.kcUpdate = null; emit(); },
  kcUpdate: () => {
    const out = KC.updateRelationships(state.social.volatility || 3);
    ui.results.kcUpdate = out;
    addLog('npc', 'Relationships updated', out.map((r) => `${r.name}: ${r.text}`).join('\n') || 'No changes.');
    emit();
  },
  kcBond: (el) => { const h = holder(el.dataset.t); finishKc(h, `${h.name}: Create Bond`, KC.createBond(h)); },
  kcBreak: async (el) => {
    const h = holder(el.dataset.t);
    let treason = false;
    if (h.level) treason = await askConfirm(`Does ${h.name} treat leaving as treason? (Yes = no roll, worst result.)`, 'Yes, treason');
    finishKc(h, `${h.name}: ${h.level ? 'Leave faction' : 'Break Bond'}`, KC.breakBond(h, 0, treason));
  },
  kcRomance: () => { const h = holder('n'); finishKc(h, `${h.name}: Start romance`, KC.startRomance(h)); },
  kcEndRomance: async () => {
    const h = holder('n');
    if (!(await askConfirm(`End the romance with ${h.name} on good terms?`, 'End it'))) return;
    finishKc(h, `${h.name}: End romance`, KC.endRomance(h));
  },
  kcLeader: (el) => { const h = holder(el.dataset.t); finishKc(h, `${h.name}: new leader`, { text: KC.becomeLeader(h) }); },
  kcRebel: (el) => {
    const f = holder('f');
    const r = el.dataset.r;
    if (r === 'won') { f.rebellion = false; }
    else { f.rebellion = false; f.level = 'outsider'; f.attitude = -2; f.hunted = r === 'deposed'; }
    finishKc(f, `${f.name}: ${{ deposed: 'deposed', stepdown: 'stepped down', won: 'rebellion ends' }[r]}`, { text: r === 'won' ? 'You keep Leadership at -2; the rebellion is over.' : `Outsider, Reputation -2${f.hunted ? ', and they hunt you' : ''}.` });
  },
  kcAsk: () => openAsk(current()),
  kcCourage: (el) => { const h = holder('n'); finishKc(h, `${h.name} gave you courage`, KC.courage(h, el.dataset.r)); },
  kcQuest: (el) => { const h = holder(el.dataset.t); finishKc(h, `${h.name}: quest progress`, { text: KC.questStage(h) }); },
  kcNag: (el) => { const h = holder(el.dataset.t); finishKc(h, `${h.name} is getting naggy`, KC.questNag(h)); },
  kcAr: (el) => { const h = holder(el.dataset.t); finishKc(h, `${h.name}: AR adjusted`, KC.changeAR(h, +el.dataset.d)); },
  kcClear: (el) => { const kc = KC.ensureKc(holder(el.dataset.t)); kc.bondCooldown = kc.romanceCooldown = kc.noImprove = false; saveKc(); emit(); },
  kcSides: (el) => { ui.drafts.kcSides = el.checked; },
  kcPair: (el) => {
    const p = state.relations.find((x) => x.id === el.dataset.id);
    const r = KC.pairAction(p, el.dataset.a);
    addLog('npc', `${KC.pairName(p)}: ${KC.PAIR_ACTIONS[el.dataset.a]}`, `2d6 [${r.dice.join('+')}]${r.mod ? ` ${r.mod > 0 ? '+' : ''}${r.mod}` : ''} = ${r.total}${r.d6 ? ` · d6 ${r.d6}` : ''} · ${r.text}`);
    toast(r.text.slice(0, 110));
    saveKc(); emit();
  },
  kcPairAtt: (el) => { const p = state.relations.find((x) => x.id === el.dataset.id); p.attitude = Math.max(-2, Math.min(2, p.attitude + +el.dataset.d)); saveKc(); emit(); },
  kcPairStage: (el) => { const kc = KC.ensureKc(state.relations.find((x) => x.id === el.dataset.id)); kc.stage = { default: 'bond', bond: 'romance', romance: 'default' }[kc.stage]; saveKc(); emit(); },
  kcPairDel: async (el) => {
    if (!(await askConfirm('Remove this relationship?', 'Remove'))) return;
    state.relations = state.relations.filter((x) => x.id !== el.dataset.id); saveKc(); emit();
  },
  kcPairAdd: () => {
    const a = document.getElementById('pair-a').value, b = document.getElementById('pair-b').value;
    if (a === b) return toast('Pick two different characters');
    if (state.relations.some((p) => p.kind === 'npc' && ((p.a === a && p.b === b) || (p.a === b && p.b === a)))) return toast('That pair already exists');
    const att = +document.getElementById('pair-att').value;
    const p = KC.addPair(a, b, 'npc', att);
    const bs = BACKSTORIES[String(att)][rollDie(6) - 1];
    p.notes = bs;
    addLog('npc', `${KC.pairName(p)}: ${levelName('default', att)}`, `Backstory: ${bs}`);
    toast(`Backstory: ${bs}`);
  },
  kcPairRandom: () => {
    const pool = ['pc', ...state.npcs.filter((n) => !n.archived).map((n) => n.id)];
    if (pool.length < 2) return toast('Add at least one NPC first');
    const a = pool.splice(rollDie(pool.length) - 1, 1)[0];
    const b = pool[rollDie(pool.length) - 1];
    let p = state.relations.find((x) => x.kind === 'npc' && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (!p) {
      p = KC.addPair(a, b, 'npc', 0);
      p.notes = BACKSTORIES['0'][rollDie(6) - 1];
    }
    addLog('npc', `Dealt: ${KC.pairName(p)}`, p.notes ? `Backstory: ${p.notes}` : '');
    toast(`${KC.pairName(p)}${p.notes ? `: ${p.notes}` : ''}`);
    saveKc(); emit();
  },
  factionAdd: () => {
    const name = (ui.drafts.newFaction || '').trim();
    if (!name) return toast('Name the faction');
    const f = KC.addFaction(name); ui.drafts.newFaction = ''; ui.drafts.factionOpen = f.id; emit();
  },
  factionOpen: (el) => { ui.drafts.factionOpen = el.dataset.id; emit(); },
  factionBack: () => { ui.drafts.factionOpen = null; emit(); },
  kcTieAdd: () => {
    const f = holder('f'); const b = document.getElementById('tie-b')?.value;
    if (!b) return toast('Add another faction first');
    if (state.relations.some((p) => p.kind === 'ties' && ((p.a === f.id && p.b === b) || (p.a === b && p.b === f.id)))) return toast('Those ties already exist');
    KC.addPair(f.id, b, 'ties', +document.getElementById('tie-att').value);
  },
  kcFirstImpression: () => {
    const n = current();
    const r = rollDie(6);
    const shift = r === 1 ? -1 : r === 6 ? 1 : 0;
    const att = Math.max(-2, Math.min(2, n.attitude + shift));
    const imp = FIRST_IMPRESSIONS[String(att)][rollDie(6) - 1];
    updateNpc(n.id, { attitude: att });
    finishKc(n, `${n.name}: first impression`, { text: `${shift ? `Your hunch was off (d6 ${r}): Attitude ${att > 0 ? '+' : ''}${att}. ` : `Hunch confirmed (d6 ${r}). `}"${imp}"` });
  },

  // ----- UNE -----
  uneIdentity: () => {
    if (needUne('modifier') || needUne('noun')) return;
    const n = current(); const id = UNE.rollIdentity();
    updateNpc(n.id, { une: { ...n.une, modifier: id.modifier, noun: id.noun } });
    addLog('npc', `${n.name}: ${id.modifier} ${id.noun}`);
  },
  unePower: () => {
    const n = current(); const r = ui.drafts.uneR || 'standard';
    const p = UNE.rollPower(r);
    if (!p) return toast(`UNE setup: Power level: ${r} table missing`);
    updateNpc(n.id, { une: { ...n.une, power: p.text } });
    addLog('npc', `${n.name} power (${r}): ${p.text}`);
  },
  uneMotives: () => {
    if (needUne('motVerb') || needUne('motNoun')) return;
    const n = current(); const m = UNE.rollMotivations();
    updateNpc(n.id, { une: { ...n.une, motivations: m } });
    addLog('npc', `${n.name} motivations`, m.join('\n'));
  },
  uneMood: () => {
    const n = current(); const rel = relationshipOf(n);
    const m = UNE.conversationMood(rel);
    if (!m) return toast(`UNE setup: Conversation mood: ${rel} table missing`);
    addLog('npc', `${n.name} is ${m.text} (UNE mood, ${rel})`);
    show(n, `<div class="muted">${esc(rel)} relationship</div><div class="answer">${esc(m.text)}</div><div class="muted small">d100 ${m.roll}</div>`);
  },
  uneDiscuss: () => {
    if (needUne('focus')) return;
    const n = current(); const x = UNE.discussion('');
    if (!x.bearing) return toast(`UNE setup: Bearing: ${x.demeanor} table missing`);
    const text = UNE.discussionText(x, n.name);
    addLog('npc', text);
    show(n, `<div class="muted">${esc(x.demeanor)}</div><div class="answer">${esc(x.bearing.text)} · ${esc(x.focus.text)}</div><p class="small">${esc(text)}</p>`);
  },

  // ----- Let's Talk -----
  talk: () => {
    const n = current();
    if (state.dialogue && !state.dialogue.ended && state.dialogue.npcId !== n.id) {
      return toast(`Finish the conversation with ${getNpc(state.dialogue.npcId)?.name || 'the other NPC'} first`);
    }
    if (state.dialogue && state.dialogue.npcId === n.id) { ui.drafts.npcTalk = true; return emit(); }
    openStartTalk(n);
  },
  ltLie: (el) => { ui.drafts.ltLie = el.checked; },
  ltPlay: (el) => {
    const r = LT.playCard(el.dataset.card, { lie: !!ui.drafts.ltLie });
    if (!r) return toast("That tone can't be used");
    if (r.needsChoice) { ui.drafts.ltChoice = { card: el.dataset.card, options: r.needsChoice }; return emit(); }
    logExchange(r);
  },
  ltChoose: (el) => {
    const c = ui.drafts.ltChoice;
    ui.drafts.ltChoice = null;
    const r = LT.playCard(c.card, { lie: !!ui.drafts.ltLie, chosen: el.dataset.level });
    if (r && !r.needsChoice) logExchange(r);
  },
  ltRedraw: (el) => LT.hardcoreRedraw(el.dataset.card),
  ltEnd: async () => { if (await askConfirm('End the conversation now?', 'End')) LT.endDialogue(); },
  ltAttitude: (el) => {
    const dl = state.dialogue; const n = getNpc(dl.npcId);
    if (!n) return;
    const v = Math.max(-2, Math.min(2, n.attitude + +el.dataset.d));
    updateNpc(n.id, { attitude: v });
    toast(`${n.name} is now ${attitudeName(v)}`);
  },
  ltPersuade: (el) => { ui.drafts.ltPersuade = LT.persuade(+el.dataset.adj); emit(); },
  ltKeepMood: () => { const dl = state.dialogue; updateNpc(dl.npcId, { mood: dl.mood.name }); toast('Saved as personality mood'); },
  ltFinish: () => {
    const s = LT.summary();
    const p = ui.drafts.ltPersuade;
    const n = getNpc(state.dialogue.npcId);
    addLog('npc', s.title, s.body + (p ? `\nAsked for something: **${p.answer}** (d10 ${p.roll})` : '') + (n ? `\nAttitude now: ${attitudeName(n.attitude)}` : ''));
    const id = state.dialogue.npcId;
    LT.closeDialogue();
    ui.drafts.npcTalk = false; ui.drafts.ltPersuade = null; ui.drafts.npcOpen = id;
    emit();
  },
};

function logExchange(r) {
  ui.drafts.ltLie = false;
  const n = getNpc(state.dialogue.npcId);
  addLog('npc', `${n?.name || 'NPC'}: ${r.tone} → **${r.reaction}**`,
    [`${LEVEL_NAMES[r.level]}${r.roll != null ? ` (d10 ${r.roll})` : ''}`, ...r.notes].join(' · '));
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
