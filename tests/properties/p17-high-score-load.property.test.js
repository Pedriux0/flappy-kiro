import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createHighScoreStore, MAX_HIGH_SCORE } from "../../src/shell/highScoreStore.js";
import { STORAGE_KEY } from "../../src/shell/constants.js";

/** Fake Storage holding a single raw value under STORAGE_KEY (null = missing). */
function fakeStorage(raw) {
  return {
    getItem(key) {
      return key === STORAGE_KEY ? raw : null;
    },
    setItem() {},
  };
}

/** Fake Storage whose getItem throws (e.g. blocked/unavailable localStorage). */
function throwingStorage(error) {
  return {
    getItem() {
      throw error;
    },
    setItem() {},
  };
}

function expectValidHighScore(value) {
  expect(Number.isInteger(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(MAX_HIGH_SCORE);
}

// Categories of invalid stored strings that must all load as 0 (R1.7, R1.8).
const invalidRaw = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string().filter((s) => !/^\s*[0-9]+\s*$/.test(s)), // non-numeric
  fc.integer({ min: -MAX_HIGH_SCORE, max: -1 }).map(String), // negative
  fc
    .tuple(fc.nat({ max: MAX_HIGH_SCORE }), fc.integer({ min: 1, max: 999 }))
    .map(([i, f]) => `${i}.${f}`), // fractional
  fc
    .bigInt({ min: BigInt(MAX_HIGH_SCORE) + 1n, max: 10n ** 30n })
    .map(String), // out of range
  fc.constantFrom("NaN", "Infinity", "-Infinity", "1e5", "0x10", "12abc", "+5")
);

describe("HighScoreStore load", () => {
  // Feature: flappy-kiro, Property 17: Stored high score always loads as a valid non-negative integer
  // For any string value present in Storage (including missing, empty, non-numeric,
  // negative, fractional, or out-of-range values), loading the high score returns a
  // non-negative integer within [0, 999,999,999] and never throws, returning 0 for
  // any invalid value.
  // **Validates: Requirements 1.5, 1.7, 1.8**
  it("Property 17: any stored string loads as an integer in range and never throws", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (raw) => {
        const store = createHighScoreStore(fakeStorage(raw));
        let value;
        expect(() => {
          value = store.load();
        }).not.toThrow();
        expectValidHighScore(value);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 17: valid in-range digit strings load as their exact value", () => {
    fc.assert(
      fc.property(fc.nat({ max: MAX_HIGH_SCORE }), (n) => {
        const store = createHighScoreStore(fakeStorage(String(n)));
        expect(store.load()).toBe(n);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 17: missing, empty, non-numeric, negative, fractional, or out-of-range values load as 0", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), invalidRaw), (raw) => {
        const store = createHighScoreStore(fakeStorage(raw));
        expect(store.load()).toBe(0);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 17: a getItem that throws loads as 0 without throwing", () => {
    fc.assert(
      fc.property(fc.anything(), (thrown) => {
        const store = createHighScoreStore(throwingStorage(thrown));
        let value;
        expect(() => {
          value = store.load();
        }).not.toThrow();
        expect(value).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
