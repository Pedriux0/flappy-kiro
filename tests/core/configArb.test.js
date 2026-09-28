// Sanity checks for the shared config generators in tests/arbitraries/config.js.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CONFIG_SCHEMA, DEFAULT_CONFIG, validateConfig } from "../../src/core/config.js";
import { validConfigArb, invalidConfigArb } from "../arbitraries/config.js";

describe("config arbitraries", () => {
  it("validConfigArb produces configs with no warnings", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        expect(validateConfig(config, CONFIG_SCHEMA)).toEqual([]);
        expect(config.ghostStartXRatio).toBe(DEFAULT_CONFIG.ghostStartXRatio);
        expect(config.ghostStartYRatio).toBe(DEFAULT_CONFIG.ghostStartYRatio);
      }),
      { numRuns: 200 },
    );
  });

  it("invalidConfigArb mutations are reported under exactly the mutated keys", () => {
    fc.assert(
      fc.property(invalidConfigArb, ({ config, mutatedKeys }) => {
        expect(mutatedKeys.length).toBeGreaterThan(0);
        const reported = new Set(validateConfig(config, CONFIG_SCHEMA).map((w) => w.key));
        expect(reported).toEqual(new Set(mutatedKeys));
      }),
      { numRuns: 500 },
    );
  });
});
