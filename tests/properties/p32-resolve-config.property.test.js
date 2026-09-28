// Feature: flappy-kiro, Property 32: For any otherwise-valid config, resolveConfig(config, CONFIG_SCHEMA) returns the config unchanged with no radius warning when ghostHitboxRadius is valid; and when ghostHitboxRadius is missing, non-numeric, below 8, above 16, or above min(ghostWidth, ghostHeight) / 2, it returns a config with ghostHitboxRadius === 12, every other field deeply equal to the input, and a warning whose key is ghostHitboxRadius and whose value is the rejected value. For any config with some other invalid value, resolveConfig keeps that value unchanged and still reports it (warn-only). It never throws.
// **Validates: Requirements 16.3, 19.8, 19.10**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  CONFIG_SCHEMA,
  DEFAULT_HITBOX_RADIUS,
  resolveConfig,
} from "../../src/core/config.js";
import { validConfigArb, invalidConfigArb } from "../arbitraries/config.js";

const KEY = "ghostHitboxRadius";
const RUNS = { numRuns: 200 };

/** Copy of a config with the radius field removed, for "every other field" comparison. */
function withoutRadius(config) {
  const { [KEY]: _omit, ...rest } = config;
  return rest;
}

const radiusWarnings = (warnings) => warnings.filter((w) => w.key === KEY);

// Invalid radius values that do not depend on the sprite size (R19.8, R19.10).
const badRadiusValueArb = fc.oneof(
  fc.constantFrom(undefined, "12", "abc", NaN, Infinity, -Infinity, null, 7, 17),
  fc.double({ min: -1000, max: 8, maxExcluded: true, noNaN: true }),
  fc.double({ min: 16, max: 1000, minExcluded: true, noNaN: true }),
);

/** Valid config with an invalid radius: either a bad value, a deleted key, or > half-sprite. */
const invalidRadiusConfigArb = fc.oneof(
  fc.tuple(validConfigArb, badRadiusValueArb).map(([config, value]) => ({
    ...config,
    [KEY]: value,
  })),
  validConfigArb.map((config) => withoutRadius(config)),
  fc
    .tuple(validConfigArb, fc.integer({ min: 24, max: 30 }))
    .chain(([config, size]) =>
      fc
        .integer({ min: Math.floor(size / 2) + 1, max: 16 })
        .map((radius) => ({ ...config, ghostWidth: size, ghostHeight: size, [KEY]: radius })),
    ),
);

/** Asserts the resolved output for a config whose radius is invalid. */
function expectRadiusResolved(input, result) {
  expect(result.config[KEY]).toBe(DEFAULT_HITBOX_RADIUS);
  expect(withoutRadius(result.config)).toEqual(withoutRadius(input));
  const rw = radiusWarnings(result.warnings);
  expect(rw).toHaveLength(1);
  expect(Object.is(rw[0].value, input[KEY])).toBe(true);
  expect(rw[0].message).toContain(`replaced with ${DEFAULT_HITBOX_RADIUS}`);
}

describe("Property 32: Invalid Hitbox radius resolves to the default; other values are untouched", () => {
  it("valid config is returned unchanged with no warnings", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        const before = structuredClone(config);
        const result = resolveConfig(config, CONFIG_SCHEMA);
        expect(result.config).toBe(config);
        expect(result.config).toEqual(before);
        expect(result.warnings).toEqual([]);
      }),
      RUNS,
    );
  });

  it("invalid radius is replaced with 12; every other field is deeply equal; input not mutated", () => {
    fc.assert(
      fc.property(invalidRadiusConfigArb, (config) => {
        const before = structuredClone(config);
        const result = resolveConfig(config, CONFIG_SCHEMA);
        expectRadiusResolved(before, result);
        expect(config).toEqual(before);
        expect(Object.is(config[KEY], before[KEY])).toBe(true);
        // Only the radius was wrong, so it is the only warning.
        expect(result.warnings).toHaveLength(1);
      }),
      RUNS,
    );
  });

  it("another invalid value stays unchanged and is still reported (warn-only)", () => {
    fc.assert(
      fc.property(invalidConfigArb, ({ config, mutatedKeys }) => {
        const before = structuredClone(config);
        const result = resolveConfig(config, CONFIG_SCHEMA);
        const keys = result.warnings.map((w) => w.key);
        for (const k of mutatedKeys) expect(keys).toContain(k);

        if (mutatedKeys.includes(KEY)) {
          expectRadiusResolved(before, result);
        } else {
          expect(result.config).toEqual(before);
          expect(radiusWarnings(result.warnings)).toEqual([]);
        }
        expect(config).toEqual(before);
      }),
      RUNS,
    );
  });

  it("invalid radius together with another invalid value: radius fixed, other value kept and reported", () => {
    const otherInvalidArb = invalidConfigArb.filter(({ mutatedKeys }) => !mutatedKeys.includes(KEY));
    fc.assert(
      fc.property(otherInvalidArb, badRadiusValueArb, ({ config, mutatedKeys }, badRadius) => {
        const input = { ...config, [KEY]: badRadius };
        const before = structuredClone(input);
        const result = resolveConfig(input, CONFIG_SCHEMA);
        expectRadiusResolved(before, result);
        const keys = result.warnings.map((w) => w.key);
        for (const k of mutatedKeys) expect(keys).toContain(k);
      }),
      RUNS,
    );
  });
});
