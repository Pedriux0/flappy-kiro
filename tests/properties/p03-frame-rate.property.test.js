// Feature: flappy-kiro, Property 3: For any Ghost and any Delta_Time dt split into N equal sub-steps, integrating the single step of dt and integrating the N sub-steps summing to dt produce approximately equal final position and velocity (within a small numerical tolerance), so motion is consistent regardless of frame rate.
// **Validates: Requirements 12.5, 14.6**
//
// Tolerances. integrate() is semi-implicit Euler, so under constant gravity:
//   - velocity is exactly frame-rate independent (vy + g·T either way);
//   - position differs by the first-order truncation error g·T²·(N−1)/(2N),
//     which is < g·T²/2 and vanishes as the frame delta T → 0. With T clamped to
//     MAX_DT = 1/30 s and gravity ≤ 4000 this is at most ~2.2 logical px.
//   - once at the terminal cap the motion is uniform, so position is exact too.
// Generated ranges never mix capped and uncapped sub-steps within one run.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { integrate } from "../../src/core/physics.js";

const MAX_DT = 1 / 30;
const FP_EPS = 1e-9;

const physicsArb = fc.record({
  gravity: fc.integer({ min: 400, max: 4000 }),
  flapVelocity: fc.integer({ min: -500, max: -400 }),
  terminalVelocity: fc.integer({ min: 200, max: 1500 }),
});
const dtArb = fc.oneof(
  fc.constant(0),
  fc.constant(MAX_DT),
  fc.double({ min: 0, max: MAX_DT, noNaN: true, noDefaultInfinity: true }),
);
const nArb = fc.integer({ min: 1, max: 8 });
const yArb = fc.double({ min: 0, max: 640, noNaN: true, noDefaultInfinity: true });
const fracArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

function makeGhost(y, vy) {
  return { x: 100, y, vy, width: 32, height: 32 };
}

function runSubSteps(ghost, dt, n, physics) {
  let g = ghost;
  for (let i = 0; i < n; i++) g = integrate(g, dt / n, physics);
  return g;
}

describe("Property 3: Frame-rate independence of motion", () => {
  it("below the terminal cap: velocity matches exactly, position within the Euler bound g·dt²/2", () => {
    fc.assert(
      fc.property(physicsArb, dtArb, nArb, yArb, fracArb, (physics, dt, n, y, frac) => {
        // vy in [flapVelocity, terminal − g·dt] so no step (single or sub) reaches the cap.
        const hi = physics.terminalVelocity - physics.gravity * dt;
        const vy = physics.flapVelocity + frac * (hi - physics.flapVelocity);
        const start = makeGhost(y, vy);

        const single = integrate(start, dt, physics);
        const multi = runSubSteps(start, dt, n, physics);

        expect(Math.abs(single.vy - multi.vy)).toBeLessThanOrEqual(FP_EPS * 1e3);
        const bound = (physics.gravity * dt * dt) / 2 + FP_EPS * 1e3;
        expect(Math.abs(single.y - multi.y)).toBeLessThanOrEqual(bound);
        expect(multi.x).toBe(start.x);
      }),
      { numRuns: 200 },
    );
  });

  it("at the terminal cap: position and velocity match within floating-point tolerance", () => {
    fc.assert(
      fc.property(physicsArb, dtArb, nArb, yArb, fracArb, (physics, dt, n, y, frac) => {
        // vy in [terminal − g·dt/N, terminal] so the very first sub-step already hits the cap.
        const lo = physics.terminalVelocity - (physics.gravity * dt) / n;
        const vy = lo + frac * (physics.terminalVelocity - lo);
        const start = makeGhost(y, vy);

        const single = integrate(start, dt, physics);
        const multi = runSubSteps(start, dt, n, physics);

        expect(single.vy).toBe(physics.terminalVelocity);
        expect(multi.vy).toBe(physics.terminalVelocity);
        expect(Math.abs(single.y - multi.y)).toBeLessThanOrEqual(FP_EPS * 1e3);
      }),
      { numRuns: 200 },
    );
  });
});
