// Feature: flappy-kiro, Property 23: For any non-negative integer score, targetPipeSpeed(score, cfg) equals min(basePipeSpeed + floor(score / speedUpInterval) · speedStep, maxPipeSpeed). In particular it equals basePipeSpeed at score 0, is monotonically non-decreasing in score, increases by exactly speedStep each time the score crosses a speedUpInterval boundary (until the cap), and never exceeds maxPipeSpeed.
// **Validates: Requirements 15.1, 15.2, 15.3, 15.4**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { targetPipeSpeed } from "../../src/core/difficulty.js";
import { validConfigArb } from "../arbitraries/config.js";

// Reference formula straight from the design (all schema values are integers,
// so the arithmetic is exact).
const expected = (score, cfg) =>
  Math.min(cfg.basePipeSpeed + Math.floor(score / cfg.speedUpInterval) * cfg.speedStep, cfg.maxPipeSpeed);

// Tier at which the cap is first reached (Infinity when speedStep is 0).
const capTier = (cfg) =>
  cfg.speedStep > 0 ? Math.ceil((cfg.maxPipeSpeed - cfg.basePipeSpeed) / cfg.speedStep) : Infinity;

/**
 * Scores biased towards the interesting regions for a given config:
 * 0, exact boundaries k·interval and their neighbours, far beyond the cap,
 * and arbitrary non-negative integers.
 */
const scoreArb = (cfg) => {
  const I = cfg.speedUpInterval;
  const tierLimit = Number.isFinite(capTier(cfg)) ? capTier(cfg) + 2 : 200;
  const boundary = fc.integer({ min: 0, max: tierLimit }).map((k) => k * I);
  const nearBoundary = fc
    .tuple(fc.integer({ min: 1, max: tierLimit }), fc.constantFrom(-1, 1))
    .map(([k, d]) => k * I + d);
  const beyondCap = fc
    .integer({ min: 1, max: 1_000_000 })
    .map((extra) => (Number.isFinite(capTier(cfg)) ? capTier(cfg) * I : 0) + extra * I);
  return fc.oneof(fc.constant(0), boundary, nearBoundary, beyondCap, fc.nat({ max: 10_000 }));
};

const cfgAndScoreArb = validConfigArb.chain((cfg) => fc.tuple(fc.constant(cfg), scoreArb(cfg)));

describe("Target pipe speed", () => {
  it("Property 23: equals the stepped, capped formula and never exceeds maxPipeSpeed", () => {
    fc.assert(
      fc.property(cfgAndScoreArb, ([cfg, score]) => {
        const speed = targetPipeSpeed(score, cfg);
        expect(speed).toBe(expected(score, cfg));
        expect(speed).toBeLessThanOrEqual(cfg.maxPipeSpeed);
        expect(speed).toBeGreaterThanOrEqual(cfg.basePipeSpeed);
      }),
      { numRuns: 300 }
    );
  });

  it("Property 23: equals basePipeSpeed at score 0 (R15.1)", () => {
    fc.assert(
      fc.property(validConfigArb, (cfg) => {
        expect(targetPipeSpeed(0, cfg)).toBe(cfg.basePipeSpeed);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 23: is monotonically non-decreasing in score", () => {
    fc.assert(
      fc.property(
        validConfigArb.chain((cfg) => fc.tuple(fc.constant(cfg), scoreArb(cfg), fc.nat({ max: 10_000 }))),
        ([cfg, score, delta]) => {
          expect(targetPipeSpeed(score + delta, cfg)).toBeGreaterThanOrEqual(targetPipeSpeed(score, cfg));
        }
      ),
      { numRuns: 300 }
    );
  });

  it("Property 23: steps by exactly speedStep at each boundary until the cap, constant within a band, then flat (R15.2–15.4)", () => {
    fc.assert(
      fc.property(
        validConfigArb.chain((cfg) =>
          fc.tuple(fc.constant(cfg), fc.integer({ min: 1, max: Math.min(capTier(cfg) + 3, 500) }))
        ),
        ([cfg, k]) => {
          const I = cfg.speedUpInterval;
          const before = targetPipeSpeed(k * I - 1, cfg);
          const at = targetPipeSpeed(k * I, cfg);
          const uncapped = cfg.basePipeSpeed + k * cfg.speedStep;

          if (uncapped <= cfg.maxPipeSpeed) {
            // Below or exactly at the cap: the crossing adds exactly one Speed_Step.
            expect(at - before).toBe(cfg.speedStep);
          } else {
            // Crossing that would overshoot is clamped to the cap.
            expect(at).toBe(cfg.maxPipeSpeed);
          }
          // No change between boundaries: every score in [k·I, (k+1)·I) gives the same speed.
          expect(targetPipeSpeed(k * I + I - 1, cfg)).toBe(at);
          // Once capped, further thresholds leave the speed unchanged.
          if (at === cfg.maxPipeSpeed) {
            expect(targetPipeSpeed((k + 1) * I, cfg)).toBe(cfg.maxPipeSpeed);
            expect(targetPipeSpeed((k + 1_000_000) * I, cfg)).toBe(cfg.maxPipeSpeed);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
