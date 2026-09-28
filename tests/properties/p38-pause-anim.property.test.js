// Feature: flappy-kiro, Property 38: For any AnimState and any dtMs, when the world is Paused and no events occur, stepAnimation returns an AnimState equal to its input (same kind, frame, elapsedMs, and rotation). Resuming then continues from the frozen elapsedMs, so the frozen frame lasts only its remaining time.
// **Validates: Requirements 20.8**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepAnimation } from "../../src/core/animation.js";
import { animStateArb, dtMsArb, dtMsSeqArb } from "../arbitraries/anim.js";
import { validConfigArb } from "../arbitraries/config.js";

const vyArb = fc.double({ min: -2000, max: 2000, noNaN: true });

describe("Pause freezes the Ghost animation", () => {
  it("Property 38: Paused with no events returns the input AnimState; resuming continues from the frozen elapsedMs", () => {
    fc.assert(
      fc.property(
        animStateArb,
        fc.array(dtMsArb, { minLength: 1, maxLength: 40 }),
        dtMsSeqArb,
        vyArb,
        validConfigArb,
        fc.boolean(),
        (anim0, pausedDts, resumeDts, vy, config, reducedMotion) => {
          const paused = { state: "Paused", ghost: { vy } };
          const playing = { state: "Playing", ghost: { vy } };
          const snapshot = structuredClone(anim0);

          // Freeze: every paused frame returns an AnimState equal to its input (R20.8).
          let frozen = anim0;
          for (const d of pausedDts) {
            frozen = stepAnimation(frozen, [], d, paused, config, reducedMotion);
            expect(frozen).toStrictEqual(snapshot);
          }
          // The input object is not mutated.
          expect(anim0).toStrictEqual(snapshot);

          // Resume: playback after the pause matches playback as if the pause never
          // happened, so the frozen frame only plays its remaining time.
          let resumed = frozen;
          let reference = anim0;
          for (const d of resumeDts) {
            resumed = stepAnimation(resumed, [], d, playing, config, reducedMotion);
            reference = stepAnimation(reference, [], d, playing, config, reducedMotion);
            expect(resumed).toStrictEqual(reference);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
