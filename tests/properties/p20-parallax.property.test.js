// Feature: flappy-kiro, Property 20: For any cloud configuration and any current pipeSpeed, there are at least two distinct layer ratios, every cloud's horizontal speed equals ratio · pipeSpeed for its layer, and every resulting layer speed is strictly less than the current pipeSpeed.
// **Validates: Requirements 12.7, 12.8**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createClouds, layerSpeeds, scrollClouds, CLOUD_BASE_WIDTH, CLOUD_SCALE_MIN } from "../../src/core/clouds.js";
import { createRng } from "../../src/core/rng.js";
import { validConfigArb } from "../arbitraries/config.js";

const playArea = { width: 480, height: 640, groundY: 560, ceilingY: 0 };

// Current pipeSpeed: either reachable from the config's difficulty range, or any positive speed.
const scenarioArb = validConfigArb.chain((config) =>
  fc.record({
    config: fc.constant(config),
    pipeSpeed: fc.oneof(
      fc.integer({ min: config.basePipeSpeed, max: config.maxPipeSpeed }),
      fc.double({ min: 1e-3, max: 1e4, noNaN: true }),
    ),
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    // Fraction of the smallest cloud width travelled in one step, so no cloud wraps.
    stepFrac: fc.double({ min: 0.01, max: 0.9, noNaN: true }),
  }),
);

describe("Parallax layers", () => {
  it("Property 20: layers are distinct, move at ratio·pipeSpeed, and stay below pipeSpeed", () => {
    fc.assert(
      fc.property(scenarioArb, ({ config, pipeSpeed, seed, stepFrac }) => {
        const ratios = config.cloudLayerSpeedRatios;

        // R12.7: at least two distinct layer ratios, hence at least two distinct layer speeds.
        expect(new Set(ratios).size).toBeGreaterThanOrEqual(2);
        const speeds = layerSpeeds(pipeSpeed, ratios);
        expect(speeds).toHaveLength(ratios.length);
        expect(new Set(speeds).size).toBeGreaterThanOrEqual(2);

        // Each layer speed is ratio · pipeSpeed and strictly below the current pipeSpeed (R12.8).
        speeds.forEach((speed, i) => {
          expect(speed).toBe(ratios[i] * pipeSpeed);
          expect(speed).toBeGreaterThan(0);
          expect(speed).toBeLessThan(pipeSpeed);
        });

        // Each cloud's actual displacement matches its layer's speed.
        const { clouds } = createClouds(config, playArea, createRng(seed));
        clouds.forEach((c) => {
          expect(c.layer).toBeGreaterThanOrEqual(0);
          expect(c.layer).toBeLessThan(ratios.length);
        });
        const dt = (stepFrac * CLOUD_BASE_WIDTH * CLOUD_SCALE_MIN) / pipeSpeed;
        const moved = scrollClouds(clouds, dt, pipeSpeed, ratios);
        expect(moved).toHaveLength(clouds.length);
        moved.forEach((after, i) => {
          const before = clouds[i];
          expect(after.layer).toBe(before.layer);
          const observed = (before.x - after.x) / dt;
          const expected = ratios[before.layer] * pipeSpeed;
          // Observed speed is reconstructed from x deltas, so compare with a tolerance;
          // the strict bound against pipeSpeed is asserted exactly on layerSpeeds above.
          expect(Math.abs(observed - expected)).toBeLessThanOrEqual(1e-6 * Math.max(1, pipeSpeed));
        });
      }),
      { numRuns: 200 },
    );
  });
});
