// Feature: flappy-kiro, Property 40: For any AnimState, stepping with a StateEntered Main_Menu event yields kind = "Idle", frame = 0, elapsedMs = 0, rotationDeg = 0, and frameVisual gives opacity 1.0, normal eyes, flash = false, and offsetX = 0.
// **Validates: Requirements 20.13**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepAnimation, frameVisual } from "../../src/core/animation.js";
import { animStateArb, animEventsArb, dtMsArb } from "../arbitraries/anim.js";
import { validConfigArb } from "../arbitraries/config.js";

const vyArb = fc.double({ min: -2000, max: 2000, noNaN: true });

describe("Property 40: Entering Main_Menu resets the animation to Idle frame 0", () => {
  it("resets any AnimState to Idle frame 0 with a neutral visual, without consuming dt", () => {
    fc.assert(
      fc.property(
        animStateArb,
        animEventsArb, // arbitrary effects emitted earlier in the same frame
        dtMsArb,
        vyArb,
        validConfigArb,
        fc.boolean(),
        (anim, before, dtMs, vy, config, reducedMotion) => {
          const effects = [...before, { type: "StateEntered", state: "Main_Menu" }];
          const world = { state: "Main_Menu", ghost: { vy } };
          const next = stepAnimation(anim, effects, dtMs, world, config, reducedMotion);

          expect(next.kind).toBe("Idle");
          expect(next.frame).toBe(0);
          expect(next.elapsedMs).toBe(0);
          expect(next.rotationDeg).toBe(0);

          for (const rm of [reducedMotion, !reducedMotion]) {
            const v = frameVisual(next, rm);
            expect(v.opacity).toBe(1);
            expect(v.eyes).toBe("normal");
            expect(v.flash).toBe(false);
            expect(v.offsetX).toBe(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
