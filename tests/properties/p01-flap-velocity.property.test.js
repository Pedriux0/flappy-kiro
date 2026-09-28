// Feature: flappy-kiro, Property 1: For any Ghost with any prior vertical velocity and any config whose physics.flapVelocity is within the schema range, applying a Flap sets the Ghost vertical velocity to exactly config.physics.flapVelocity (−450 in DEFAULT_CONFIG), so no momentum accumulates across consecutive Flaps.
// **Validates: Requirements 3.4, 14.2**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyFlap, integrate } from "../../src/core/physics.js";

// Schema range for physics.flapVelocity (R3.4): -500..-400.
const flapVelocityArb = fc.double({ min: -500, max: -400, noNaN: true });

const finite = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const ghostArb = fc.record({
  x: finite(0, 480),
  y: finite(-1000, 2000),
  vy: finite(-1e6, 1e6), // any prior velocity, far outside normal play
  width: fc.constant(32),
  height: fc.constant(32),
});

const physicsArb = flapVelocityArb.chain((flapVelocity) =>
  fc.record({
    gravity: finite(400, 4000),
    flapVelocity: fc.constant(flapVelocity),
    terminalVelocity: finite(200, 1500),
  })
);

describe("Flap velocity", () => {
  it("Property 1: a single flap sets vy to exactly flapVelocity and leaves other fields intact", () => {
    fc.assert(
      fc.property(ghostArb, flapVelocityArb, (ghost, flapVelocity) => {
        const before = { ...ghost };
        const flapped = applyFlap(ghost, flapVelocity);
        expect(flapped.vy).toBe(flapVelocity);
        expect(flapped.x).toBe(ghost.x);
        expect(flapped.y).toBe(ghost.y);
        expect(flapped.width).toBe(ghost.width);
        expect(flapped.height).toBe(ghost.height);
        expect(ghost).toEqual(before); // input not mutated
      }),
      { numRuns: 200 }
    );
  });

  it("Property 1: consecutive flaps (with integration between) never accumulate momentum", () => {
    fc.assert(
      fc.property(
        ghostArb,
        physicsArb,
        fc.array(fc.option(finite(0, 0.05), { nil: undefined }), { minLength: 1, maxLength: 20 }),
        (ghost, physics, steps) => {
          let g = ghost;
          for (const dt of steps) {
            // undefined -> flap immediately again; number -> integrate, then flap
            if (dt !== undefined) g = integrate(g, dt, physics);
            g = applyFlap(g, physics.flapVelocity);
            expect(g.vy).toBe(physics.flapVelocity);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
