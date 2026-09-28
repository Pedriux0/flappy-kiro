// Feature: flappy-kiro, Property 25: For any current pipeSpeed in the reachable range [basePipeSpeed, maxPipeSpeed] and any configured layer ratios (each in (0, 1)), every layer's effective speed ratio · pipeSpeed is strictly less than pipeSpeed, so the parallax relationship holds after every difficulty increase.
// **Validates: Requirements 15.6, 12.8**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { layerSpeeds } from "../../src/core/clouds.js";
import { targetPipeSpeed } from "../../src/core/difficulty.js";
import { validConfigArb } from "../../tests/arbitraries/config.js";

const RUNS = { numRuns: 200 };

describe("Cloud layers stay below pipe speed", () => {
  it("Property 25: every layer is strictly slower than the pipe speed reached at any score", () => {
    fc.assert(
      fc.property(validConfigArb, fc.nat({ max: 100000 }), (config, score) => {
        // Reachable pipe speed, derived exactly as the game does after each increase.
        const pipeSpeed = targetPipeSpeed(score, config);
        expect(pipeSpeed).toBeGreaterThanOrEqual(config.basePipeSpeed);
        expect(pipeSpeed).toBeLessThanOrEqual(config.maxPipeSpeed);

        const speeds = layerSpeeds(pipeSpeed, config.cloudLayerSpeedRatios);
        expect(speeds).toHaveLength(config.cloudLayerSpeedRatios.length);
        speeds.forEach((speed, i) => {
          expect(speed).toBe(config.cloudLayerSpeedRatios[i] * pipeSpeed);
          expect(speed).toBeLessThan(pipeSpeed);
        });
      }),
      RUNS,
    );
  });

  it("Property 25: every layer is strictly slower for any pipe speed in [basePipeSpeed, maxPipeSpeed]", () => {
    const arb = validConfigArb.chain((config) =>
      fc
        .double({ min: config.basePipeSpeed, max: config.maxPipeSpeed, noNaN: true })
        .map((pipeSpeed) => ({ config, pipeSpeed })),
    );
    fc.assert(
      fc.property(arb, ({ config, pipeSpeed }) => {
        for (const speed of layerSpeeds(pipeSpeed, config.cloudLayerSpeedRatios)) {
          expect(speed).toBeLessThan(pipeSpeed);
        }
      }),
      RUNS,
    );
  });
});
