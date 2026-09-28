// Feature: flappy-kiro, Property 19: For any deterministic RNG seed, every generated cloud has an opacity within [0.3, 0.8].
// **Validates: Requirements 12.6**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createClouds } from "../../src/core/clouds.js";
import { createRng } from "../../src/core/rng.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { validConfigArb } from "../arbitraries/config.js";

const OPACITY_MIN = 0.3;
const OPACITY_MAX = 0.8;

const seedArb = fc.integer({ min: 0, max: 0xffffffff });

// Play areas with a positive height between ceiling and ground.
const playAreaArb = fc
  .record({
    width: fc.integer({ min: 200, max: 1920 }),
    ceilingY: fc.integer({ min: 0, max: 50 }),
    playHeight: fc.integer({ min: 200, max: 1080 }),
  })
  .map(({ width, ceilingY, playHeight }) => ({
    width,
    height: ceilingY + playHeight + 80,
    ceilingY,
    groundY: ceilingY + playHeight,
  }));

function assertOpacityBounds(config, clouds) {
  expect(clouds).toHaveLength(config.cloudCount);
  for (const cloud of clouds) {
    expect(Number.isFinite(cloud.opacity)).toBe(true);
    // Absolute R12.6 bounds.
    expect(cloud.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
    expect(cloud.opacity).toBeLessThanOrEqual(OPACITY_MAX);
    // Configured range, itself within the absolute bounds.
    expect(cloud.opacity).toBeGreaterThanOrEqual(config.cloudOpacityMin);
    expect(cloud.opacity).toBeLessThanOrEqual(config.cloudOpacityMax);
  }
}

describe("Property 19: Cloud generation stays within opacity bounds", () => {
  it("every cloud from the default config has opacity in [0.3, 0.8] for any seed", () => {
    fc.assert(
      fc.property(seedArb, playAreaArb, (seed, playArea) => {
        const { clouds } = createClouds(DEFAULT_CONFIG, playArea, createRng(seed));
        assertOpacityBounds(DEFAULT_CONFIG, clouds);
      }),
      { numRuns: 200 },
    );
  });

  it("every cloud from any valid config has opacity in its configured range within [0.3, 0.8]", () => {
    fc.assert(
      fc.property(validConfigArb, seedArb, playAreaArb, (config, seed, playArea) => {
        const { clouds } = createClouds(config, playArea, createRng(seed));
        assertOpacityBounds(config, clouds);
      }),
      { numRuns: 200 },
    );
  });
});
