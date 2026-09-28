// Feature: flappy-kiro, Property 26: For any config generated with every schema-tracked value inside its [min, max] range, maxPipeSpeed >= basePipeSpeed, at least two distinct cloudLayerSpeedRatios each strictly inside (0, 1), and ghostHitboxRadius <= min(ghostWidth, ghostHeight) / 2 — including DEFAULT_CONFIG itself — validateConfig(config, CONFIG_SCHEMA) returns an empty array.
// **Validates: Requirements 16.1, 16.6, 16.7**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DEFAULT_CONFIG, CONFIG_SCHEMA, validateConfig } from "../../src/core/config.js";
import { validConfigArb } from "../arbitraries/config.js";

describe("Property 26: Valid configs produce no warnings", () => {
  it("DEFAULT_CONFIG produces no warnings (R16.6)", () => {
    expect(validateConfig(DEFAULT_CONFIG, CONFIG_SCHEMA)).toEqual([]);
  });

  it("DEFAULT_CONFIG physics and threshold interval match R14.1–14.3 and R15.2 (R16.7)", () => {
    expect(DEFAULT_CONFIG.physics.gravity).toBe(1600);
    expect(DEFAULT_CONFIG.physics.flapVelocity).toBe(-450);
    expect(DEFAULT_CONFIG.physics.terminalVelocity).toBe(700);
    expect(DEFAULT_CONFIG.speedUpInterval).toBe(5);
  });

  it("any valid config produces no warnings (R16.1, R16.6)", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        expect(validateConfig(config, CONFIG_SCHEMA)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
