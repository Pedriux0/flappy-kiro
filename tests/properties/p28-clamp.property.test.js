// Feature: flappy-kiro, Property 28: For any schema entry and any finite number v, clampToSchema(key, v, schema) returns a value in [min, max], and returns v unchanged when v is already in [min, max].
// **Validates: Requirements 17.6**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CONFIG_SCHEMA, clampToSchema } from "../../src/core/config.js";

const finite = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const entryArb = fc.constantFrom(...CONFIG_SCHEMA);

// Any finite number, biased toward the entry's range and its boundaries.
const entryAndValueArb = entryArb.chain((entry) =>
  fc.tuple(
    fc.constant(entry),
    fc.oneof(
      finite(-Number.MAX_VALUE, Number.MAX_VALUE),
      finite(entry.min - 1000, entry.max + 1000),
      finite(entry.min, entry.max),
      fc.constantFrom(entry.min, entry.max)
    )
  )
);

const inRangeArb = entryArb.chain((entry) =>
  fc.tuple(fc.constant(entry), fc.oneof(finite(entry.min, entry.max), fc.constantFrom(entry.min, entry.max)))
);

describe("clampToSchema", () => {
  it("Property 28: clamped value always lies in [min, max]", () => {
    fc.assert(
      fc.property(entryAndValueArb, ([entry, v]) => {
        const out = clampToSchema(entry.key, v, CONFIG_SCHEMA);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(entry.min);
        expect(out).toBeLessThanOrEqual(entry.max);
        if (v < entry.min) expect(out).toBe(entry.min);
        if (v > entry.max) expect(out).toBe(entry.max);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 28: in-range values are returned unchanged", () => {
    fc.assert(
      fc.property(inRangeArb, ([entry, v]) => {
        const out = clampToSchema(entry.key, v, CONFIG_SCHEMA);
        // Numeric equality: -0 and 0 are the same value for a tuning parameter.
        expect(out === v).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
