// =============================================================
// dice.js — dice notation parser + roller
// -------------------------------------------------------------
// Understands strings like:
//   d20          one twenty-sided die
//   3d6+2        three d6 plus two
//   2d20kh1      roll 2d20, keep the highest 1 (advantage)
//   2d20kl1      keep the lowest 1 (disadvantage)
//   4d6kh3       classic stat roll
//   d%  / d100   percentile
//   4dF          Fate/Fudge dice (each is -1, 0 or +1)
//   1d8+1d6-1    several terms added together
//
// How it works: we split the expression into "terms" separated
// by + or -, then roll each term and add them up. We keep every
// individual die so the result can show its work ("[4, 2] + 1").
// =============================================================

import { rollDie } from './rng.js';

// A regular expression ("regex") describing one dice term.
// Pieces, in order:
//   (\d*)        optional count, e.g. the "3" in 3d6
//   d            the letter d
//   (\d+|%|F)    sides: a number, % (=100) or F (Fate)
//   (?:(kh|kl)(\d+))?   optional keep-highest / keep-lowest
const DICE_TERM = /^(\d*)d(\d+|%|f)(?:(kh|kl)(\d+))?$/i;

/**
 * Parse + roll an expression. Returns:
 *   { expr, total, parts: [{ text, sign, rolls, kept, value }] }
 * Throws an Error with a friendly message if it can't parse.
 */
export function roll(expression) {
  const expr = String(expression).replace(/\s+/g, '').toLowerCase();
  if (!expr) throw new Error('Type something to roll, like 2d6+1');

  // Split "3d6+2-1d4" into ["3d6", "+2", "-1d4"].
  // The regex finds a run of characters optionally starting with + or -.
  const tokens = expr.match(/[+-]?[^+-]+/g);
  if (!tokens) throw new Error(`Couldn't read "${expression}"`);

  const parts = [];
  let total = 0;

  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1;
    const body = token.replace(/^[+-]/, '');

    // Plain number, e.g. the "+2"
    if (/^\d+$/.test(body)) {
      const value = parseInt(body, 10);
      parts.push({ text: body, sign, rolls: null, kept: null, value });
      total += sign * value;
      continue;
    }

    const m = body.match(DICE_TERM);
    if (!m) throw new Error(`Couldn't read "${body}". Try something like 2d6 or d20.`);

    const count = m[1] === '' ? 1 : parseInt(m[1], 10);
    const sidesRaw = m[2];
    const isFate = sidesRaw === 'f';
    const sides = sidesRaw === '%' ? 100 : isFate ? 3 : parseInt(sidesRaw, 10);

    // Sanity limits so a typo like 99999d6 doesn't freeze the phone.
    if (count < 1 || count > 200) throw new Error('Roll between 1 and 200 dice at a time.');
    if (sides < 1 || sides > 10000) throw new Error('Dice need between 1 and 10000 sides.');

    // Roll every die. Fate dice map 1/2/3 → -1/0/+1.
    const rolls = [];
    for (let i = 0; i < count; i++) {
      const r = rollDie(sides);
      rolls.push(isFate ? r - 2 : r);
    }

    // Work out which dice are kept (all of them, unless kh/kl).
    let keptIdx = rolls.map((_, i) => i);
    if (m[3]) {
      const keepN = Math.min(parseInt(m[4], 10), count);
      // Sort the *positions* by the die value, then take the first N.
      const order = keptIdx.slice().sort((a, b) =>
        m[3] === 'kh' ? rolls[b] - rolls[a] : rolls[a] - rolls[b]);
      keptIdx = order.slice(0, keepN).sort((a, b) => a - b);
    }
    const kept = rolls.map((_, i) => keptIdx.includes(i));
    const value = rolls.reduce((sum, r, i) => (kept[i] ? sum + r : sum), 0);

    parts.push({ text: body, sign, rolls, kept, value, isFate });
    total += sign * value;
  }

  return { expr: expression.trim(), total, parts };
}

/**
 * Turn a roll result into a short human-readable breakdown, e.g.
 *   "[4, ~~2~~, 6] + 1"   (struck-through dice were dropped by kh/kl)
 * `md` = true uses Markdown strikethrough; false uses plain "(2)".
 */
export function describe(result, md = false) {
  return result.parts.map((p, i) => {
    const sign = p.sign < 0 ? ' - ' : i === 0 ? '' : ' + ';
    if (!p.rolls) return sign + p.value;
    const fmt = (r) => (p.isFate ? (r > 0 ? '+' : r < 0 ? '−' : '0') : String(r));
    const dice = p.rolls.map((r, j) =>
      p.kept[j] ? fmt(r) : md ? `~~${fmt(r)}~~` : `(${fmt(r)})`).join(', ');
    return `${sign}[${dice}]`;
  }).join('');
}

/** Quick check used by the tables engine for inline {2d6} rolls. */
export function isDiceExpression(text) {
  try { roll(text); return true; } catch { return false; }
}
