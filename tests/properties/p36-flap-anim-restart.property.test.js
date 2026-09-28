// Feature: flappy-kiro, Property 36: For any AnimState (any kind, frame, and elapsed time) and any dtMs, stepping with a FlapApplied event in Playing yields kind = "Flap", frame = 0, elapsedMs = 0; and for any subsequent sequence of dtMs values with no further events, the animation shows frames 0, 1, 2 for 60, 60, and 80 ms of accumulated time and is Glide once accumulated time reaches 200 ms.
// **Validates: Requirements 20.2, 20.3, 20.4**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepAnimation } from "../../src/core/animation.js";
import { animStateArb, dtMsArb, dtMsSeqArb, GAME_STATES } from "../arbitraries/anim.js";
import { validConfigArb } from "../arbitraries/config.js";

const vyArb = fc.double({ min: -2000, max: 2000, noNaN: true });

// Effects that may accompany a Flap in the same frame without cancelling it:
// anything except entering Game_Over (which blocks later Flaps, R20.12).
const nonDeathEventArb = fc.oneof(
  fc.constant({ type: "FlapApplied" }),
  fc
    .constantFrom(...GAME_STATES.filter((s) => s !== "Game_Over"))
    .map((state) => ({ type: "StateEntered", state })),
);

// An effect list containing at least one FlapApplied and no Game_Over entry,
// and whose last animation-resetting event is a FlapApplied.
const flapEffectsArb = fc
  .tuple(fc.array(nonDeathEventArb, { maxLength: 3 }), fc.array(fc.constant({ type: "FlapApplied" }), { maxLength: 2 }))
  .map(([prefix, extraFlaps]) => [...prefix, { type: "FlapApplied" }, ...extraFlaps]);

const FLAP_BOUNDARIES = [60, 120, 200];
const EPS = 1e-6;

/** Expected (kind, frame) after `t` ms of accumulated Flap time. */
function expectedAt(t) {
  if (t < 60) return { kind: "Flap", frame: 0 };
  if (t < 120) return { kind: "Flap", frame: 1 };
  if (t < 200) return { kind: "Flap", frame: 2 };
  return { kind: "Glide", frame: 0 };
}

describe("Flap animation restart", () => {
  it("Property 36: every FlapApplied restarts Flap at frame 0, then plays 60/60/80 ms and becomes Glide at 200 ms", () => {
    fc.assert(
      fc.property(
        animStateArb,
        flapEffectsArb,
        dtMsArb,
        dtMsSeqArb,
        vyArb,
        validConfigArb,
        fc.boolean(),
        (anim0, effects, dtMs, seq, vy, config, reducedMotion) => {
          const world = { state: "Playing", ghost: { vy } };

          // Restart: Flap frame 0 with no elapsed time, regardless of prior state (R20.2, R20.3).
          let anim = stepAnimation(anim0, effects, dtMs, world, config, reducedMotion);
          expect(anim.kind).toBe("Flap");
          expect(anim.frame).toBe(0);
          expect(anim.elapsedMs).toBe(0);

          // Playback with no further events (R20.2, R20.4).
          let t = 0;
          for (const d of seq) {
            anim = stepAnimation(anim, [], d, world, config, reducedMotion);
            t += d;
            const nearBoundary = FLAP_BOUNDARIES.some((b) => Math.abs(t - b) < EPS);
            if (nearBoundary) {
              // Floating-point accumulation may land on either side of an exact boundary.
              const before = expectedAt(t - EPS);
              const after = expectedAt(t + EPS);
              const ok = [before, after].some((e) => e.kind === anim.kind && e.frame === anim.frame);
              expect(ok).toBe(true);
            } else {
              const e = expectedAt(t);
              expect(anim.kind).toBe(e.kind);
              expect(anim.frame).toBe(e.frame);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
