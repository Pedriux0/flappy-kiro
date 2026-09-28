// Feature: flappy-kiro, Property 39: For any AnimState, frameVisual(anim, true) has offsetX = 0, offsetY = 0, and flash = false, and equals frameVisual(anim, false) in eyes, opacity, scaleX, scaleY, and rotationDeg. For any sequence of events and dtMs values, stepAnimation produces identical AnimState sequences with reducedMotion true and false.
// **Validates: Requirements 20.10**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepAnimation, frameVisual } from "../../src/core/animation.js";
import { animStateArb, animEventsArb, dtMsArb, GAME_STATES } from "../arbitraries/anim.js";
import { validConfigArb } from "../arbitraries/config.js";

const vyArb = fc.double({ min: -2000, max: 2000, noNaN: true });

/** One loop tick: the effects stepWorld emitted, the dt, and the world after it. */
const tickArb = fc.record({
  effects: animEventsArb,
  dtMs: dtMsArb,
  state: fc.constantFrom(...GAME_STATES),
  vy: vyArb,
});

describe("Reduced motion", () => {
  it("Property 39a: frameVisual with reducedMotion zeroes offsets and flash, keeping eyes/opacity/scale/rotation", () => {
    fc.assert(
      fc.property(animStateArb, (anim) => {
        const reduced = frameVisual(anim, true);
        const full = frameVisual(anim, false);
        expect(reduced.offsetX).toBe(0);
        expect(reduced.offsetY).toBe(0);
        expect(reduced.flash).toBe(false);
        expect(reduced.eyes).toBe(full.eyes);
        expect(reduced.opacity).toBe(full.opacity);
        expect(reduced.scaleX).toBe(full.scaleX);
        expect(reduced.scaleY).toBe(full.scaleY);
        expect(reduced.rotationDeg).toBe(full.rotationDeg);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 39b: stepAnimation yields identical AnimState sequences with reducedMotion true and false", () => {
    fc.assert(
      fc.property(
        animStateArb,
        fc.array(tickArb, { maxLength: 40 }),
        validConfigArb,
        (start, ticks, config) => {
          let a = start;
          let b = start;
          for (const { effects, dtMs, state, vy } of ticks) {
            const world = { state, ghost: { vy } };
            a = stepAnimation(a, effects, dtMs, world, config, true);
            b = stepAnimation(b, effects, dtMs, world, config, false);
            expect(a).toEqual(b);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
