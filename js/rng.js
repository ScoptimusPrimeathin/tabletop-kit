// =============================================================
// rng.js — random number helpers
// -------------------------------------------------------------
// Every random thing in the app (dice, card shuffles, table rolls)
// goes through this file, so if we ever want to change how
// randomness works (e.g. add a seeded mode for testing) there's
// exactly one place to do it.
//
// We use crypto.getRandomValues() instead of Math.random().
// Both work offline. crypto is just a higher-quality source of
// randomness, and it costs nothing extra.
// =============================================================

/**
 * Returns a random whole number from 1 to `sides` (inclusive).
 * Example: rollDie(6) → 1, 2, 3, 4, 5 or 6.
 *
 * "Rejection sampling": a 32-bit random number has 4,294,967,296
 * possible values. If that isn't an exact multiple of `sides`,
 * using % (remainder) would make low numbers very slightly more
 * likely. So we throw away the few values in the uneven "tail"
 * and draw again. In practice this almost never loops.
 */
export function rollDie(sides) {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`Bad die size: ${sides}`);
  const MAX = 0x100000000; // 2^32
  const limit = MAX - (MAX % sides); // biggest fair cut-off
  const buf = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return (n % sides) + 1;
}

/** Random integer from min to max inclusive. */
export function randInt(min, max) {
  return min + rollDie(max - min + 1) - 1;
}

/** Pick one random element of an array. */
export function pick(arr) {
  return arr[rollDie(arr.length) - 1];
}

/** true/false with a 50% chance (used for tarot reversals). */
export function coin() {
  return rollDie(2) === 1;
}

/**
 * Shuffle an array in place using the Fisher–Yates algorithm
 * (the standard "fair" shuffle: every order is equally likely).
 * Returns the same array for convenience.
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rollDie(i + 1) - 1; // 0..i
    [arr[i], arr[j]] = [arr[j], arr[i]]; // swap
  }
  return arr;
}

/** Short random id for saved things (tables, log entries…). */
export function uid() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(36) + buf[1].toString(36);
}
