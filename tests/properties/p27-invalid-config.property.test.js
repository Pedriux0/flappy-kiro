// Feature: flappy-kiro, Property 27: For any otherwise-valid config modified to contain a schema value outside its range (including non-finite values), maxPipeSpeed < basePipeSpeed, a cloud ratio <= 0 or >= 1, or ghostHitboxRadius > min(ghostWidth, ghostHeight) / 2, validateConfig returns at least one warning whose key names the offending value (both maxPipeSpeed and basePipeSpeed for the cross-field case, the ratio index for a bad cloud ratio) and whose value is the current setting. For any input, validateConfig never throws.
// **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 19.8**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateConfig, getConfigValue, CONFIG_SCHEMA } from "../../src/core/config.js";
import { invalidConfigArb } from "../arbitraries/config.js";

const PAIR_KEY = "maxPipeSpeed/basePipeSpeed";
const RATIO_KEY = /^cloudLayerSpeedRatios\[(\d+)\]$/;

/** The current setting a warning for `key` should carry as its value. */
function expectedValue(config, key) {
  if (key === PAIR_KEY) {
    return { maxPipeSpeed: config.maxPipeSpeed, basePipeSpeed: config.basePipeSpeed };
  }
  const ratio = RATIO_KEY.exec(key);
  if (ratio) return config.cloudLayerSpeedRatios[Number(ratio[1])];
  return getConfigValue(config, key);
}

describe("Invalid config validation", () => {
  it("Property 27: every offending value is reported by key with its current value", () => {
    fc.assert(
      fc.property(invalidConfigArb, ({ config, mutatedKeys }) => {
        let warnings;
        expect(() => {
          warnings = validateConfig(config, CONFIG_SCHEMA);
        }).not.toThrow();
        expect(Array.isArray(warnings)).toBe(true);
        expect(warnings.length).toBeGreaterThan(0);
        expect(mutatedKeys.length).toBeGreaterThan(0);

        for (const key of mutatedKeys) {
          const matching = warnings.filter((w) => w.key === key);
          expect(matching.length, `no warning for key ${key}`).toBeGreaterThan(0);
          const want = expectedValue(config, key);
          // Object.is handles NaN/-0 for scalars; the pair value is compared structurally.
          const sameValue = (v) =>
            Object.is(v, want) ||
            (want !== null && typeof want === "object" && JSON.stringify(v) === JSON.stringify(want));
          expect(matching.some((w) => sameValue(w.value)), `wrong value for key ${key}`).toBe(true);
          if (key === PAIR_KEY) {
            expect(key).toContain("maxPipeSpeed");
            expect(key).toContain("basePipeSpeed");
          }
          for (const w of matching) expect(typeof w.message).toBe("string");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("Property 27: validateConfig never throws for any input", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (config, schema) => {
        let warnings;
        expect(() => {
          warnings = validateConfig(config, CONFIG_SCHEMA);
        }).not.toThrow();
        expect(Array.isArray(warnings)).toBe(true);
        expect(() => validateConfig(config, schema)).not.toThrow();
        expect(Array.isArray(validateConfig(config, schema))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
