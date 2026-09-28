// Deterministic, immutable PRNG (mulberry32) so pipe and cloud generation is
// reproducible in tests (R6.4, R12.3).
//
// An RNG is a frozen object holding only its 32-bit state. `next()` never
// mutates it; it returns the drawn value together with a new RNG for the
// following draw, so there is no shared mutable state between callers.

/**
 * @typedef {{ next(): { value: number, rng: RNG } }} RNG
 */

/**
 * Normalize any seed to an unsigned 32-bit integer. Non-finite seeds map to 0.
 * @param {number} seed
 * @returns {number}
 */
function toUint32(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n) >>> 0;
}

/**
 * Build an RNG positioned at a given 32-bit state.
 * @param {number} state unsigned 32-bit integer
 * @returns {RNG}
 */
function rngFromState(state) {
  return Object.freeze({
    next() {
      const nextState = (state + 0x6d2b79f5) >>> 0;
      let t = nextState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // in [0, 1)
      return { value, rng: rngFromState(nextState) };
    },
  });
}

/**
 * Create a seeded, immutable RNG.
 * @param {number} seed
 * @returns {RNG}
 */
export function createRng(seed) {
  return rngFromState(toUint32(seed));
}
