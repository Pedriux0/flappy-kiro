// HighScoreStore: loads and persists the High_Score in localStorage
// (design: "HighScoreStore"; R1.5–1.8, R9.3, R9.4).
// No storage access at import time, so this module is importable from node tests.
import { STORAGE_KEY } from './constants.js';

/** Upper bound for a displayable High_Score (R1.5). */
export const MAX_HIGH_SCORE = 999_999_999;

const DIGITS = /^[0-9]+$/;

/**
 * Parse a raw stored value into a valid High_Score.
 * Accepts only plain non-negative decimal integers (strings of digits, or integer numbers)
 * within [0, MAX_HIGH_SCORE]. Anything else — null/undefined, empty, non-numeric, negative,
 * fractional, exponent notation, or out of range — yields 0 (R1.7, R1.8).
 * @param {unknown} raw
 * @returns {number}
 */
export function parseHighScore(raw) {
  let value;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    const text = raw.trim();
    if (!DIGITS.test(text)) return 0;
    value = Number(text);
  } else {
    return 0;
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_HIGH_SCORE) return 0;
  return value;
}

/** Resolve the default storage lazily; returns null if unavailable or access throws. */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a HighScoreStore bound to a Storage-like object ({ getItem, setItem }).
 * When `storage` is omitted, `globalThis.localStorage` is resolved on each call inside a try,
 * so construction and import never throw even where localStorage is missing or blocked.
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void } | null} [storage]
 * @returns {{ load(): number, apply(effects: Array<{ type: string, value?: number }>): void }}
 */
export function createHighScoreStore(storage) {
  const resolve = () => (storage === undefined ? defaultStorage() : storage);

  return {
    /** Read and validate the stored High_Score; never throws, returns 0 on any failure (R1.6–1.8). */
    load() {
      try {
        const s = resolve();
        if (!s) return 0;
        return parseHighScore(s.getItem(STORAGE_KEY));
      } catch {
        return 0;
      }
    },

    /**
     * Persist every PersistHighScore effect as an integer string (R9.3).
     * Write failures are swallowed so the in-memory High_Score stays authoritative (R9.4).
     * @param {Array<{ type: string, value?: number }>} effects
     */
    apply(effects) {
      if (!Array.isArray(effects)) return;
      for (const effect of effects) {
        if (!effect || effect.type !== 'PersistHighScore') continue;
        const v = effect.value;
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const int = Math.min(MAX_HIGH_SCORE, Math.max(0, Math.trunc(v)));
        try {
          const s = resolve();
          if (s) s.setItem(STORAGE_KEY, String(int));
        } catch (err) {
          // Non-blocking: log at most (design: "High score write failure").
          try { console.warn('High score could not be saved:', err); } catch { /* ignore */ }
        }
      }
    },
  };
}
