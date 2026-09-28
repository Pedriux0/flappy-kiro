// Feature: flappy-kiro, Property 35: For any vertical velocity vy and any physics config within the schema ranges, velocityTilt(vy, physics) equals clamp(−20 + 65 · (vy − flapVelocity) / (terminalVelocity − flapVelocity), −20, 45), lies in [−20, 45], is non-decreasing in vy, returns −20 at flapVelocity and 45 at terminalVelocity, and (for any Playing world) stepAnimation sets rotationDeg to this value within 0.5°.
// **Validates: Requirements 20.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { velocityTilt, stepAnimation } from "../../src/core/animation.js";
import { validConfigArb } from "../arbitraries/config.js";
import { animStateArb, dtMsArb } from "../arbitraries/anim.js";

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const expectedTilt = (vy, { flapVelocity, terminalVelocity }) =>
  clamp(-20 + (65 * (vy - flapVelocity)) / (terminalVelocity - flapVelocity), -20, 45);

// Velocities well beyond both ends of the tilt range, plus the exact endpoints.
const vyArb = (physics) =>
  fc.oneof(
    fc.double({ min: -5000, max: 5000, noNaN: true }),
    fc.double({ min: physics.flapVelocity, max: physics.terminalVelocity, noNaN: true }),
    fc.constantFrom(physics.flapVelocity, physics.terminalVelocity, 0),
  );

const physicsArb = validConfigArb.map((c) => c.physics);
const physicsWithVyArb = physicsArb.chain((physics) => fc.tuple(fc.constant(physics), vyArb(physics)));

// Anim states that stay in Flap/Glide after stepping: Flap/Glide states with no
// effects, or any non-Death state followed by a FlapApplied (Playing entry flap).
const playingAnimCaseArb = fc.oneof(
  animStateArb
    .filter((a) => a.kind === "Flap" || a.kind === "Glide")
    .map((anim) => ({ anim, effects: [] })),
  animStateArb
    .filter((a) => a.kind !== "Death")
    .map((anim) => ({ anim, effects: [{ type: "FlapApplied" }] })),
);

describe("Property 35: velocity tilt", () => {
  it("equals the clamped linear formula and lies in [−20, 45]", () => {
    fc.assert(
      fc.property(physicsWithVyArb, ([physics, vy]) => {
        const tilt = velocityTilt(vy, physics);
        expect(Math.abs(tilt - expectedTilt(vy, physics))).toBeLessThanOrEqual(EPS);
        expect(tilt).toBeGreaterThanOrEqual(-20);
        expect(tilt).toBeLessThanOrEqual(45);
      }),
      { numRuns: 200 },
    );
  });

  it("is non-decreasing in vy", () => {
    fc.assert(
      fc.property(
        physicsArb.chain((p) => fc.tuple(fc.constant(p), vyArb(p), vyArb(p))),
        ([physics, a, b]) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(velocityTilt(lo, physics)).toBeLessThanOrEqual(velocityTilt(hi, physics) + EPS);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns −20 at flapVelocity and 45 at terminalVelocity", () => {
    fc.assert(
      fc.property(physicsArb, (physics) => {
        expect(velocityTilt(physics.flapVelocity, physics)).toBeCloseTo(-20, 9);
        expect(velocityTilt(physics.terminalVelocity, physics)).toBeCloseTo(45, 9);
      }),
      { numRuns: 200 },
    );
  });

  it("stepAnimation in a Playing world sets rotationDeg to velocityTilt within 0.5°", () => {
    fc.assert(
      fc.property(
        validConfigArb.chain((config) => fc.tuple(fc.constant(config), vyArb(config.physics))),
        playingAnimCaseArb,
        dtMsArb,
        ([config, vy], { anim, effects }, dtMs) => {
          const world = { state: "Playing", ghost: { vy } };
          const next = stepAnimation(anim, effects, dtMs, world, config, false);
          expect(["Flap", "Glide"]).toContain(next.kind);
          expect(Math.abs(next.rotationDeg - expectedTilt(vy, config.physics))).toBeLessThanOrEqual(0.5);
        },
      ),
      { numRuns: 200 },
    );
  });
});
