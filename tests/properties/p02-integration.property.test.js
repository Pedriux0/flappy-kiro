// Feature: flappy-kiro, Property 2: For any Ghost, any Delta_Time dt ≥ 0, any config with physics values inside the schema ranges, and no Flap on that frame, integration produces vy' = min(vy + config.physics.gravity · dt, config.physics.terminalVelocity) and y' = y + vy' · dt, and leaves x unchanged. In particular vy' never exceeds config.physics.terminalVelocity.
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 14.1, 14.3, 14.4, 14.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { integrate } from "../../src/core/physics.js";
import { validConfigArb } from "../arbitraries/config.js";

const EPS = 1e-9;

/** |a - b| within a tolerance scaled to the magnitude of the operands. */
const close = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

const ghostArb = fc.record({
  x: fc.double({ min: -1000, max: 2000, noNaN: true }),
  y: fc.double({ min: -2000, max: 2000, noNaN: true }),
  vy: fc.double({ min: -3000, max: 3000, noNaN: true }),
  width: fc.integer({ min: 1, max: 128 }),
  height: fc.integer({ min: 1, max: 128 }),
});

// dt ≥ 0, including 0 and values beyond a typical frame clamp.
const dtArb = fc.oneof(fc.constant(0), fc.double({ min: 0, max: 0.25, noNaN: true }));

describe("Property 2: Single-step physics integration", () => {
  it("vy' = min(vy + g·dt, terminal), y' = y + vy'·dt, x unchanged", () => {
    fc.assert(
      fc.property(ghostArb, dtArb, validConfigArb, (ghost, dt, config) => {
        const { gravity, terminalVelocity } = config.physics;
        const before = { ...ghost };
        const next = integrate(ghost, dt, config.physics);

        const expectedVy = Math.min(ghost.vy + gravity * dt, terminalVelocity);
        const expectedY = ghost.y + expectedVy * dt;

        expect(close(next.vy, expectedVy)).toBe(true);
        expect(close(next.y, expectedY)).toBe(true);
        expect(next.vy).toBeLessThanOrEqual(terminalVelocity);
        expect(next.x).toBe(ghost.x);
        expect(next.width).toBe(ghost.width);
        expect(next.height).toBe(ghost.height);
        // Pure: input Ghost is not mutated.
        // (toEqual, not toStrictEqual: fc.record objects have a null prototype.)
        expect(ghost).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });
});
