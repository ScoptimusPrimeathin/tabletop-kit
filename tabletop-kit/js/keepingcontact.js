// =============================================================
// keepingcontact.js — KEEPING CONTACT! relationship rules
// -------------------------------------------------------------
// Works on any "relationship holder": something with
//   .attitude  (-2..+2)  and  .kc  (the state below)
// That's an NPC card (you ↔ NPC), a pair (NPC ↔ NPC, faction ↔
// faction ties) or a faction (you ↔ faction).
//
// kc = { ar, stressed, pleased, stage: 'default'|'bond'|'romance',
//        quest: { name, done: 0..3, active },
//        noImprove, bondCooldown, romanceCooldown,
//        bondBonus, romanceBonus, nextMod, foe, crush }
//
// Credit + labels: data/keepingcontact.js
// =============================================================

import { state, save, emit } from './state.js';
import { rollDie, uid } from './rng.js';

export function ensureKc(h) {
  // Fill in missing fields IN PLACE: other code keeps references to h.kc.
  const defaults = {
    ar: 0, stressed: false, pleased: false, stage: 'default',
    noImprove: false, bondCooldown: false, romanceCooldown: false,
    bondBonus: 0, romanceBonus: 0, nextMod: 0, foe: false, crush: '',
  };
  if (!h.kc) h.kc = {};
  for (const [k, v] of Object.entries(defaults)) if (h.kc[k] === undefined) h.kc[k] = v;
  if (!h.kc.quest) h.kc.quest = { name: '', done: 0, active: false };
  return h.kc;
}

const clampAtt = (v) => Math.max(-2, Math.min(2, v));
export const isBonded = (h) => ensureKc(h).stage !== 'default';
export const questDone = (h) => ensureKc(h).quest.done >= 3;

/** AR limits: default -4/+6; a finished quest or a Bond → -5/+5; both → -6/+4. */
export function limits(h) {
  const bond = isBonded(h) || h.level === 'member' || h.level === 'leader';
  const q = questDone(h);
  if (bond && q) return [-6, 4];
  if (bond || q) return [-5, 5];
  return [-4, 6];
}

/** Keep AR inside the limits after they change (new Bond, finished quest…). */
export function clampAr(h) {
  const kc = ensureKc(h);
  const [min, max] = limits(h);
  kc.ar = Math.max(min, Math.min(max, kc.ar));
  return kc.ar;
}

export function roll2d6(mod = 0) {
  const a = rollDie(6), b = rollDie(6);
  return { dice: [a, b], mod, total: a + b + mod };
}
const band = (t) => (t >= 10 ? 'hit' : t >= 7 ? 'mixed' : 'miss');
const sgn = (n) => (n > 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------
// Approval rating
// ---------------------------------------------------------------
/**
 * Change AR. Romance makes every non-zero change one point bigger.
 * A cooldown after a messy break-up blocks improvements. Hitting
 * the top makes the Attitude Pleased; the bottom, Stressed.
 */
export function changeAR(h, delta, why = '') {
  const kc = ensureKc(h);
  const notes = [];
  let d = delta;
  if (kc.stage === 'romance' && d !== 0) { d += Math.sign(d); notes.push('romance: stronger'); }
  if (d > 0 && kc.noImprove) { notes.push('hurt feelings: no improvement for now'); d = 0; }
  const [min, max] = limits(h);
  const before = kc.ar;
  kc.ar = Math.max(min, Math.min(max, kc.ar + d));
  if (kc.ar >= max && d > 0 && !kc.pleased) { kc.pleased = true; notes.push('now Pleased'); }
  if (kc.ar <= min && d < 0 && !kc.stressed) { kc.stressed = true; notes.push('now Stressed'); }
  return { why, before, after: kc.ar, delta: d, notes };
}

/** level: 'slight' | 'lot' | 'favor' | 'lifetime' */
export function approve(h, level) {
  const kc = ensureKc(h);
  if (level === 'slight' || level === 'lot') {
    const r = rollDie(6);
    const amt = level === 'slight' ? (r <= 3 ? 0 : 1) : (r <= 3 ? 1 : 2);
    return { roll: r, ...changeAR(h, amt, level === 'slight' ? 'pleased them a bit' : 'pleased them a lot') };
  }
  const [, max] = limits(h);
  const before = kc.ar;
  if (level === 'favor') {
    kc.stressed = false; kc.pleased = true; kc.ar = max;
    return { why: 'a great favour', before, after: max, notes: ['Pleased, AR to maximum'] };
  }
  kc.stressed = false; kc.pleased = false; kc.ar = max;
  const old = h.attitude; h.attitude = clampAtt(h.attitude + 1);
  return { why: 'a once-in-a-lifetime favour', before, after: max, notes: [`conditions cleared, AR to maximum, Attitude ${sgn(old)} → ${sgn(h.attitude)}`] };
}

/** level: 'slight' | 'clear' | 'harm' | 'betrayal' */
export function disapprove(h, level) {
  const kc = ensureKc(h);
  if (level === 'slight' || level === 'clear') {
    const r = rollDie(6);
    const amt = level === 'slight' ? (r <= 3 ? 0 : -1) : (r <= 3 ? -1 : -2);
    return { roll: r, ...changeAR(h, amt, level === 'slight' ? 'they didn\'t like it' : 'angered or saddened them') };
  }
  const [min] = limits(h);
  const before = kc.ar;
  if (level === 'harm') {
    kc.stressed = false; kc.pleased = false; kc.ar = min;
    if (h.attitude <= -2) return { why: 'great harm', before, after: min, notes: [breakAll(h, 'bitter foe')] };
    const old = h.attitude; h.attitude -= 1;
    return { why: 'great harm', before, after: min, notes: [`conditions cleared, AR to minimum, Attitude ${sgn(old)} → ${sgn(h.attitude)}`] };
  }
  h.attitude = -2;
  return { why: 'betrayal', before, after: kc.ar, notes: [breakAll(h, 'bitter foe')] };
}

/** End every special relationship: a foe (or, for factions, hunting you). */
function breakAll(h, label) {
  const kc = ensureKc(h);
  kc.stage = 'default'; kc.foe = true; kc.stressed = false; kc.pleased = false;
  h.attitude = -2;
  if (h.level) { h.level = 'outsider'; h.hunted = true; return 'they are now your enemy and hunting you'; }
  return `they are now your ${label}; any Bond or romance is broken`;
}

// ---------------------------------------------------------------
// Update relationships (e.g. when you make camp; ~twice a session)
// Only Stressed and/or Pleased attitudes are checked.
// `change` = highest d6 that changes the Attitude (3 normal, 4 or 5 = more volatile)
// ---------------------------------------------------------------
export function updateOne(h, change = 3) {
  const kc = ensureKc(h);
  if (!kc.stressed && !kc.pleased) return null;
  if (kc.stressed && kc.pleased) {
    kc.stressed = kc.pleased = false; kc.ar = 0;
    return { roll: null, text: 'Stressed and Pleased: both cleared, AR 0. No change.' };
  }
  const r = rollDie(6);
  if (kc.stressed) {
    kc.stressed = false; kc.ar = 0;
    if (r <= change) {
      if (h.attitude <= -2) {
        if (kc.stage === 'romance') { kc.stage = 'default'; return { roll: r, text: 'Worse… the romance is over. Attitude -2.' }; }
        if (kc.stage === 'bond' || h.level === 'member' || h.level === 'leader') {
          if (h.level === 'leader') { h.rebellion = true; return { roll: r, text: 'Leadership can\'t fall further: open rebellion!' }; }
          return { roll: r, text: `Worse… ${breakAll(h, 'enemy')}.` };
        }
        if (h.level === 'outsider') { h.hunted = true; return { roll: r, text: 'Reputation already -2: they now hunt you.' }; }
        return { roll: r, text: 'Worse, but already at -2.' };
      }
      const old = h.attitude; h.attitude -= 1;
      return { roll: r, text: `It\'s getting worse: Attitude ${sgn(old)} → ${sgn(h.attitude)}.` };
    }
    return { roll: r, text: 'Bullet dodged: Stressed cleared, AR 0.' };
  }
  // Pleased
  const wasHigh = kc.ar >= 3;
  kc.pleased = false;
  if (r <= change) {
    kc.ar = 0;
    if (h.attitude >= 2) {
      const romanceHint = kc.stage === 'bond' && !h.level ? ' Maybe time to think about romance (Start romance gets +2).' : '';
      if (kc.stage === 'bond' && !h.level) kc.romanceBonus = Math.max(kc.romanceBonus, 2);
      return { roll: r, text: `Getting better, already at +2.${romanceHint}` };
    }
    const old = h.attitude; h.attitude += 1;
    return { roll: r, text: `Getting better: Attitude ${sgn(old)} → ${sgn(h.attitude)}.` };
  }
  kc.ar = wasHigh ? 2 : 0;
  return { roll: r, text: `No change this time. Pleased cleared, AR ${kc.ar}.` };
}

// ---------------------------------------------------------------
// Bonds and romance (you ↔ NPC, or you ↔ faction for membership)
// ---------------------------------------------------------------
export const bondCount = () =>
  state.npcs.filter((n) => !n.archived && n.kc && n.kc.stage !== 'default').length
  + state.factions.filter((f) => f.level !== 'outsider').length;

/** Attitude used as a roll modifier (+1 more in a romance). */
const attMod = (h) => h.attitude + (ensureKc(h).stage === 'romance' ? 1 : 0);

export function canCreateBond(h) {
  const kc = ensureKc(h);
  if (kc.stage !== 'default' || (h.level && h.level !== 'outsider')) return 'Already bonded';
  if (h.attitude < 0) return 'Needs Attitude 0 or better';
  if (kc.stressed) return 'Not while Stressed';
  if (kc.bondCooldown) return 'Asked recently; wait a few days';
  if (bondCount() >= 5) return 'You already have 5 Bonds';
  return '';
}

export function createBond(h, extra = 0) {
  const kc = ensureKc(h);
  const mod = h.attitude + kc.quest.done + kc.bondBonus + extra;
  const r = roll2d6(mod);
  const b = band(r.total);
  let text;
  if (b === 'hit') {
    kc.bondBonus = 0;
    if (h.level) { h.level = 'member'; h.attitude = Math.min(h.attitude, 0); text = 'Accepted: you are now a member (Status starts at 0 or lower).'; }
    else { kc.stage = 'bond'; text = 'They accept: you now have a Bond.'; }
    clampAr(h);
  } else if (b === 'mixed') {
    kc.bondCooldown = true; kc.bondBonus = 2;
    text = 'Something\'s there, but it\'s too soon. Try again in a few days with +2.';
  } else {
    kc.bondCooldown = true; kc.bondBonus = 0;
    const ar = changeAR(h, -1);
    text = `They reject it. Wait a few days. AR ${sgn(ar.after)}.`;
  }
  return { ...r, band: b, text };
}

export function breakBond(h, extra = 0, treason = false) {
  const kc = ensureKc(h);
  if (kc.ar > 0) kc.ar = 0;
  kc.pleased = false;
  const r = treason ? { dice: [], mod: 0, total: 0 } : roll2d6(h.attitude + extra);
  const b = treason ? 'miss' : band(r.total);
  const leaving = () => { if (h.level) h.level = 'outsider'; else kc.stage = 'default'; };
  let text;
  if (b === 'hit') { leaving(); text = 'Parted as well as anyone could. Attitude stays.'; }
  else if (b === 'mixed') { leaving(); kc.noImprove = true; text = 'Hurt feelings: no AR improvements for a while.'; }
  else if (h.level) { h.level = 'outsider'; h.attitude = -2; h.hunted = true; text = 'They see it as treason: Reputation -2 and they hunt you.'; }
  else if (h.attitude <= -2) { kc.stage = 'default'; kc.foe = true; text = 'A bad break-up: they now hate you.'; }
  else { kc.stage = 'default'; h.attitude -= 1; text = `A bad break-up: Attitude drops to ${sgn(h.attitude)}.`; }
  return { ...r, band: b, text };
}

export function canStartRomance(h) {
  const kc = ensureKc(h);
  if (h.level) return 'Not with a faction!';
  if (kc.stage !== 'bond') return 'Needs a Bond first';
  if (h.attitude < 2) return 'Needs Attitude +2';
  if (!kc.pleased || kc.stressed) return 'Needs Pleased (and not Stressed)';
  if (kc.romanceCooldown) return 'Asked recently; wait a few days';
  return '';
}

export function startRomance(h) {
  const kc = ensureKc(h);
  const r = roll2d6(kc.romanceBonus);
  const b = band(r.total);
  let text;
  if (b === 'hit') { kc.stage = 'romance'; h.attitude = 0; kc.romanceBonus = 0; clampAr(h); text = 'Love is in the air! Romance starts at Romantic (0).'; }
  else if (b === 'mixed') { kc.romanceCooldown = true; kc.romanceBonus = 2; text = 'Receptive, but not ready. Try again in a few days with +2.'; }
  else { kc.romanceCooldown = true; kc.romanceBonus = 0; const ar = changeAR(h, -2); text = `Too soon: rejected. AR ${sgn(ar.after)}.`; }
  return { ...r, band: b, text };
}

export function endRomance(h) {
  const kc = ensureKc(h);
  if (kc.ar > 0) kc.ar = 0;
  kc.pleased = false;
  const r = roll2d6(attMod(h));
  const b = band(r.total);
  let text;
  if (b === 'hit') { kc.stage = 'bond'; text = 'It was good while it lasted: still a Bond at the same level.'; }
  else if (b === 'mixed') {
    if (h.attitude <= -2) { kc.stage = 'default'; text = 'Hurt feelings: no longer a Bond, Attitude -2.'; }
    else { kc.stage = 'bond'; h.attitude -= 1; text = `Hurt feelings: a Bond one level lower (${sgn(h.attitude)}).`; }
  } else { kc.stage = 'default'; h.attitude = -2; text = 'Bad choice of words: every tie is broken, Attitude -2.'; }
  return { ...r, band: b, text };
}

// ---------------------------------------------------------------
// Ask for something (optional rule)
//   opts.debt: call in a debt (needs Pleased, not Stressed): +2
//   opts.intimidate: leverage on a non-Bond: +2, Attitude -1 and Stressed
//   opts.skill: social skill bonus +1 (once per session)
// ---------------------------------------------------------------
export function askFor(h, opts = {}) {
  const kc = ensureKc(h);
  let mod = attMod(h) + (opts.skill ? 1 : 0);
  const notes = [];
  if (opts.debt) {
    if (!kc.pleased || kc.stressed) notes.push('can\'t call in a debt (needs Pleased, not Stressed)');
    else { mod += 2; kc.pleased = false; if (kc.ar > 0) kc.ar = 0; notes.push('called in a debt'); }
  }
  if (opts.intimidate) {
    if (kc.stage !== 'default') notes.push('can\'t intimidate a Bond');
    else { mod += 2; h.attitude = clampAtt(h.attitude - 1); kc.stressed = true; notes.push('intimidated: Attitude -1 and Stressed'); }
  }
  const r = roll2d6(mod);
  const b = band(r.total);
  const text = b === 'hit' ? 'Yes, for at most a small favour in return.'
    : b === 'mixed' ? 'Yes, but they\'ll ask a similar favour later.'
    : 'No.';
  return { ...r, band: b, text, notes };
}

// ---------------------------------------------------------------
// Personal / Faction quest: 3 stages
// ---------------------------------------------------------------
export function questStage(h) {
  const q = ensureKc(h).quest;
  q.done = Math.min(3, q.done + 1);
  q.active = false;
  clampAr(h);
  return q.done >= 3 ? 'Quest complete! AR limits improve.' : `Stage ${q.done} of 3 done.`;
}
/** Ignoring an active quest stage: -1 AR (-2 in a romance, via changeAR). */
export const questNag = (h) => changeAR(h, -1, 'neglected their quest');

// ---------------------------------------------------------------
// Bond benefits
// ---------------------------------------------------------------
export function courage(h, result) {
  return result === 'crit' ? changeAR(h, 1, 'critical success with their courage') : changeAR(h, -1, 'still failed with their courage');
}

// ---------------------------------------------------------------
// Pair actions (NPC ↔ NPC, or factions ↔ factions)
// Result effects are applied to the pair; `nextMod` is a one-off
// bonus/penalty for the pair's next roll.
// ---------------------------------------------------------------
export const PAIR_ACTIONS = {
  intimacy: 'A moment of intimacy',
  argument: 'A heated argument',
  polite: 'A polite conversation',
  entente: 'Entente cordiale',
  mutual: 'For the mutual benefit',
  heads: 'Butting heads',
};

export function pairAction(p, action) {
  const kc = ensureKc(p);
  const mod = attMod(p) + (kc.nextMod || 0);
  kc.nextMod = 0;
  const r = roll2d6(mod);
  const t = r.total;
  const d6 = () => rollDie(6);
  const ar = (n) => changeAR(p, n).after;
  let text, sub = null;
  const stress = () => {
    if (kc.stressed) { const u = updateOne(p); return `Already Stressed: immediate update. ${u ? u.text : ''}`; }
    kc.stressed = true; return 'The relationship is Stressed.';
  };
  switch (action) {
    case 'intimacy':
    case 'mutual': {
      if (action === 'intimacy' && t >= 12) {
        if (kc.stage === 'romance') { changeAR(p, 2); text = `A special moment for the couple. AR ${sgn(kc.ar)}.`; break; } // +2 becomes +3 in romance
        if (p.attitude >= 2) { text = 'One of them develops a crush on the other (or, with a crush already, may try to start a romance).'; kc.crush = kc.crush ? 'both' : 'one'; break; }
      }
      if (t >= 10) { kc.nextMod = 1; text = `They connect (AR ${sgn(ar(1))}) and get +1 on their next roll together.`; }
      else if (t >= 7) {
        if (rollDie(2) === 1) text = `They connect: AR ${sgn(ar(1))}.`;
        else { kc.nextMod = 1; text = '+1 on their next roll together.'; }
      } else {
        sub = d6();
        if (action === 'intimacy') text = sub <= 2 ? 'Someone else interrupts the moment (that person gets -1 on their next roll with each of them).'
          : sub <= 4 ? `Someone says the wrong thing: AR ${sgn(ar(-1))}.` : 'Circumstances cut it short, no harm done.';
        else text = sub <= 2 ? `A fiasco: AR ${sgn(ar(-1))}.` : sub <= 4 ? 'Something urgent intervenes: roll a random event!' : 'Win some, lose some. No consequences.';
      }
      break;
    }
    case 'argument':
    case 'heads': {
      if (t >= 12) { text = `Just a silly misunderstanding after all! AR ${sgn(ar(1))}.`; break; }
      if (t >= 10) { text = action === 'argument' ? 'They agree to disagree. Not bad at all.' : 'After some chest-pounding, a compromise.'; break; }
      sub = d6();
      if (t >= 7) {
        text = sub <= 2 ? (kc.nextMod = -1, 'Postponed, not forgotten: -1 on their next roll together.')
          : sub <= 4 ? `Hidden grudges: AR ${sgn(ar(-1))}.` : 'No further consequences.';
      } else {
        text = sub <= 2 ? `It turns ugly, but they stop in time: AR ${sgn(ar(-2))}.`
          : sub <= 4 ? stress() : (kc.nextMod = -2, 'Plenty of grudges: -2 on their next roll together.');
      }
      break;
    }
    case 'polite':
    case 'entente': {
      if (t >= 10) text = `Common ground: AR ${sgn(ar(1))}.`;
      else if (t >= 7) { kc.nextMod = 1; text = 'Interesting: +1 on their next roll together.'; }
      else {
        sub = d6();
        text = sub <= 2 ? 'Agree to disagree; no consequences.'
          : sub <= 4 ? (kc.nextMod = -1, 'Smiles in public, a quiet grudge: -1 on their next roll together.')
          : `Hurtful words: AR ${sgn(ar(-1))}.`;
      }
      break;
    }
    default: text = '?';
  }
  return { ...r, d6: sub, text };
}

// ---------------------------------------------------------------
// Pairs and factions (stored per campaign)
// ---------------------------------------------------------------
export function addPair(a, b, kind = 'npc', attitude = 0) {
  const p = { id: uid(), a, b, kind, attitude, notes: '' };
  ensureKc(p);
  state.relations.push(p);
  save('relations'); emit();
  return p;
}
export const pairsOf = (id) => state.relations.filter((p) => p.a === id || p.b === id);

export function addFaction(name) {
  const f = { id: uid(), name, level: 'outsider', attitude: 0, hunted: false, rebellion: false, notes: '' };
  ensureKc(f);
  state.factions.push(f);
  save('factions'); emit();
  return f;
}

/** Becoming leader: start at 0 if Status was positive, else -1. */
export function becomeLeader(f) {
  f.level = 'leader';
  f.attitude = f.attitude > 0 ? 0 : -1;
  ensureKc(f).ar = 0;
  return `You lead ${f.name}. Leadership ${sgn(f.attitude)}.`;
}

/** Choosing sides: helping a faction annoys its enemies (Ties -2). */
export function enemiesOf(fid) {
  return state.relations
    .filter((p) => p.kind === 'ties' && (p.a === fid || p.b === fid) && p.attitude <= -2)
    .map((p) => state.factions.find((f) => f.id === (p.a === fid ? p.b : p.a)))
    .filter(Boolean);
}

/** Run the update on everything that has conditions. */
export function updateRelationships(change = 3) {
  const out = [];
  for (const n of state.npcs.filter((x) => !x.archived && x.kc)) {
    const r = updateOne(n, change); if (r) out.push({ name: n.name, ...r });
  }
  for (const f of state.factions) { const r = updateOne(f, change); if (r) out.push({ name: f.name, ...r }); }
  for (const p of state.relations) { const r = updateOne(p, change); if (r) out.push({ name: pairName(p), ...r }); }
  save('npcs', 'factions', 'relations'); emit();
  return out;
}

export function nameOf(id) {
  if (id === 'pc') return 'You';
  return state.npcs.find((n) => n.id === id)?.name || state.factions.find((f) => f.id === id)?.name || '?';
}
export const pairName = (p) => `${nameOf(p.a)} & ${nameOf(p.b)}`;
