// Feature: flappy-kiro, Property 37: For any sequence of non-negative dtMs values with accumulated time T and no events: starting from Idle frame 0 in Main_Menu, the frame index is floor(T / 150) mod 4 and the visual offsetY follows [0, −2, 0, +2] with rotation 0; starting from StateEntered Game_Over with any prior rotation ρ, the phase at time T is flash for T < 80, crosses for 80 ≤ T < 200, shake +2 for 200 ≤ T < 260, shake −2 for 260 ≤ T < 320, and the hold frame (crossed eyes, offset 0, opacity 0.7) for T ≥ 320, with rotationDeg = ρ throughout. At most one frame sequence with flash = true occurs per Game_Over entry.
// **Validates: Requirements 20.1, 20.6, 20.11, 20.12**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { initialAnimState, stepAnimation, frameVisual, DEATH_HOLD_FRAME } from "../../src/core/animation.js";
import { animStateArb, dtMsSeqArb } from "../arbitraries/anim.js";
import { validConfigArb } from "../arbitraries/config.js";

const vyArb = fc.double({ min: -2000, max: 2000, noNaN: true });

// Integer dt steps in [0, 33] keep the running sum exact in floating point, so
// every Idle (150·k) and Death (80, 200, 260, 320) boundary is hit precisely.
const integerDtSeqArb = fc.array(fc.integer({ min: 0, max: 33 }), { maxLength: 60 });

// Either exact integer sequences (checked strictly) or the shared sequences,
// which include fractional dts (checked with boundary tolerance).
const seqArb = fc.oneof(
  integerDtSeqArb.map((seq) => ({ seq, exact: true })),
  dtMsSeqArb.map((seq) => ({ seq, exact: seq.every(Number.isInteger) })),
);

const EPS = 1e-6;
const IDLE_OFFSET_Y = [0, -2, 0, 2];
const DEATH_BOUNDARIES = [80, 200, 260, 320];

/** Expected Idle frame at accumulated time t (R20.1). */
const idleFrameAt = (t) => Math.floor(t / 150) % 4;

/** Expected Death frame index at accumulated time t (R20.6, R20.12). */
function deathFrameAt(t) {
  if (t < 80) return 0;
  if (t < 200) return 1;
  if (t < 260) return 2;
  if (t < 320) return 3;
  return DEATH_HOLD_FRAME;
}

/** Candidate expectations at t: one exactly, or both sides when t is within EPS of a boundary. */
function candidates(t, exact, fn, boundaries) {
  if (exact || !boundaries(t)) return [fn(t)];
  return [fn(t - EPS), fn(t + EPS)];
}

const nearIdleBoundary = (t) => t > EPS && Math.abs(t - Math.round(t / 150) * 150) < EPS;
const nearDeathBoundary = (t) => DEATH_BOUNDARIES.some((b) => Math.abs(t - b) < EPS);

/** Expected visual of Death frame `f` (eyes/offset/opacity/flash), before rotation. */
function expectedDeathVisual(f, reducedMotion) {
  switch (f) {
    case 0: return { eyes: "normal", offsetX: 0, opacity: 1, flash: !reducedMotion };
    case 1: return { eyes: "cross", offsetX: 0, opacity: 1, flash: false };
    case 2: return { eyes: "cross", offsetX: reducedMotion ? 0 : 2, opacity: 1, flash: false };
    case 3: return { eyes: "cross", offsetX: reducedMotion ? 0 : -2, opacity: 1, flash: false };
    default: return { eyes: "cross", offsetX: 0, opacity: 0.7, flash: false };
  }
}

describe("Frame tables drive Idle and Death timing", () => {
  it("Property 37 (Idle): frame = floor(T/150) mod 4, offsetY follows [0, −2, 0, +2], rotation 0", () => {
    fc.assert(
      fc.property(seqArb, vyArb, validConfigArb, fc.boolean(), ({ seq, exact }, vy, config, reducedMotion) => {
        const world = { state: "Main_Menu", ghost: { vy } };
        let anim = initialAnimState();
        expect(anim.kind).toBe("Idle");
        expect(anim.frame).toBe(0);

        let t = 0;
        for (const d of seq) {
          anim = stepAnimation(anim, [], d, world, config, reducedMotion);
          t += d;
          expect(anim.kind).toBe("Idle");
          expect(anim.rotationDeg).toBe(0);

          const frames = candidates(t, exact, idleFrameAt, nearIdleBoundary);
          expect(frames).toContain(anim.frame);

          const visual = frameVisual(anim, reducedMotion);
          expect(visual.offsetY).toBe(reducedMotion ? 0 : IDLE_OFFSET_Y[anim.frame]);
          expect(visual.offsetX).toBe(0);
          expect(visual.rotationDeg).toBe(0);
          expect(visual.flash).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("Property 37 (Death): flash → crosses → shake ±2 → hold at 80/200/260/320 ms, rotation locked at ρ, one flash run per entry", () => {
    fc.assert(
      fc.property(
        animStateArb,
        seqArb,
        vyArb,
        validConfigArb,
        fc.boolean(),
        (prior, { seq, exact }, vy, config, reducedMotion) => {
          const rho = prior.rotationDeg;
          const world = { state: "Game_Over", ghost: { vy } };

          // Entry: Death frame 0, no elapsed time, rotation locked at ρ (R20.6, R20.12).
          let anim = stepAnimation(prior, [{ type: "StateEntered", state: "Game_Over" }], 16, world, config, reducedMotion);
          expect(anim.kind).toBe("Death");
          expect(anim.frame).toBe(0);
          expect(anim.elapsedMs).toBe(0);
          expect(anim.rotationDeg).toBe(rho);

          let flashRuns = 0;
          let prevFlash = false;
          const track = (visual) => {
            if (visual.flash && !prevFlash) flashRuns += 1;
            prevFlash = visual.flash;
          };
          track(frameVisual(anim, reducedMotion));

          let t = 0;
          for (const d of seq) {
            anim = stepAnimation(anim, [], d, world, config, reducedMotion);
            t += d;
            expect(anim.kind).toBe("Death");
            expect(anim.rotationDeg).toBe(rho);

            const frames = candidates(t, exact, deathFrameAt, nearDeathBoundary);
            expect(frames).toContain(anim.frame);

            const visual = frameVisual(anim, reducedMotion);
            const e = expectedDeathVisual(anim.frame, reducedMotion);
            expect(visual.eyes).toBe(e.eyes);
            expect(visual.offsetX).toBe(e.offsetX);
            expect(visual.offsetY).toBe(0);
            expect(visual.opacity).toBe(e.opacity);
            expect(visual.flash).toBe(e.flash);
            expect(visual.rotationDeg).toBe(rho);
            track(visual);
          }

          // At most one flash sequence per Game_Over entry (R20.11).
          expect(flashRuns).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
