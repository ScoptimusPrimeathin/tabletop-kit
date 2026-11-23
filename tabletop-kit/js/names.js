// =============================================================
// names.js — random NPC names
// -------------------------------------------------------------
// Three sources (chosen per campaign in the name picker):
//   • builtin  — our own syllable sets in a few flavours
//   • table    — roll one of your tables once (a list of full names)
//   • syllables— roll one of your tables 2–3 times and join the
//                results (for tables of name fragments)
// =============================================================

import { state, save } from './state.js';
import { rollDie, pick } from './rng.js';
import { getTable, rollTable } from './tables.js';

// Original syllable sets. start + (middle) + end.
export const STYLES = {
  fantasy: {
    label: 'Fantasy',
    start: ['Ae', 'Bra', 'Cel', 'Dor', 'El', 'Fen', 'Gal', 'Hal', 'Ith', 'Kae', 'Lor', 'Mer', 'Nym', 'Or', 'Per', 'Quel', 'Ryn', 'Sel', 'Tha', 'Val', 'Wyn', 'Yse', 'Zan'],
    middle: ['a', 'e', 'i', 'o', 'ri', 'la', 'the', 'va', 'ni', 'dra', 'mi', 'so'],
    end: ['dor', 'wen', 'ric', 'iel', 'mir', 'ra', 'nor', 'eth', 'ian', 'wyn', 'is', 'ael', 'mund', 'ys', 'riel', 'thas'],
  },
  earthy: {
    label: 'Rustic',
    start: ['Ab', 'Bran', 'Col', 'Dun', 'Ed', 'Fa', 'Gar', 'Hob', 'Jen', 'Kit', 'Mab', 'Nell', 'Os', 'Pip', 'Rob', 'Sam', 'Tam', 'Wil', 'Bet', 'Mol', 'Ned', 'Tess'],
    middle: ['', '', '', 'a', 'e', 'i', 'ble', 'ly', 'wi'],
    end: ['by', 'son', 'ret', 'win', 'ley', 'kin', 'dle', 'ton', 'ert', 'bel', 'ie', 'ford', 'wick', 'ney', 'mer'],
  },
  harsh: {
    label: 'Harsh',
    start: ['Gra', 'Kro', 'Dru', 'Vor', 'Zug', 'Thra', 'Skar', 'Bru', 'Gor', 'Kha', 'Ruk', 'Mog', 'Urg', 'Dra', 'Vak'],
    middle: ['', 'a', 'u', 'o', 'ga', 'ru'],
    end: ['k', 'gar', 'th', 'nak', 'ug', 'osh', 'rak', 'dush', 'mor', 'gul', 'zar', 'ok', 'rim'],
  },
  lyrical: {
    label: 'Lyrical',
    start: ['A', 'Be', 'Ce', 'Da', 'E', 'Fi', 'Li', 'Ma', 'Ni', 'O', 'Ri', 'Sa', 'Te', 'Vi', 'Ye', 'Lu', 'Mi', 'Ala'],
    middle: ['li', 'ra', 'na', 'si', 'lu', 'me', 'ri', 'a', 'o'],
    end: ['a', 'na', 'lia', 'ra', 'ne', 'sa', 'ya', 'lie', 'nae', 'ora', 'elle', 'ine'],
  },
  scifi: {
    label: 'Sci-fi',
    start: ['Ax', 'Jex', 'Kai', 'Nova', 'Rho', 'Sy', 'Tav', 'Vex', 'Zed', 'Ori', 'Cal', 'Dex', 'Ilo', 'Mira', 'Quin'],
    middle: ['', '', 'a', 'o', 'i', '-', 'ra'],
    end: ['an', 'is', 'on', 'ix', 'ar', 'ex', 'ra', 'en', 'os', 'yn', 'ek', 'us'],
  },
};

function builtin(style, tries = 0) {
  const s = STYLES[style] || STYLES.fantasy;
  const mid = rollDie(3) === 1 ? pick(s.middle) : '';
  let name = pick(s.start) + mid + pick(s.end);
  name = name.replace(/-+$/, '').replace(/^-+/, '');
  if (name.length < 4 && tries < 10) return builtin(style, tries + 1); // skip stubs like "Oa"
  return name[0].toUpperCase() + name.slice(1).toLowerCase().replace(/-(.)/g, (m, c) => '-' + c.toUpperCase());
}

/** Current campaign's name settings (stored with the social options). */
export function nameSettings() {
  const s = state.social;
  if (!s.names) s.names = { mode: 'builtin', style: 'fantasy', tableId: '', minParts: 2, maxParts: 3 };
  return s.names;
}

export function saveNameSettings(changes) {
  Object.assign(nameSettings(), changes);
  save('social');
}

/** One name using the current settings. */
export function randomName() {
  const ns = nameSettings();
  const t = ns.tableId && getTable(ns.tableId);
  if (ns.mode === 'table' && t) return rollTable(t).text.trim();
  if (ns.mode === 'syllables' && t) {
    const lo = Math.max(1, ns.minParts || 2), hi = Math.max(lo, ns.maxParts || 3);
    const n = lo + rollDie(hi - lo + 1) - 1;
    let out = '';
    for (let i = 0; i < n; i++) out += rollTable(t).text.trim();
    out = out.toLowerCase();
    return out[0].toUpperCase() + out.slice(1);
  }
  return builtin(ns.style);
}

export const randomNames = (n = 6) => Array.from({ length: n }, randomName);
