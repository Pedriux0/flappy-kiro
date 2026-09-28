// fast-check generators for the Ghost animation properties (Properties 34–40).
// Requirements: 20.1, 20.2, 20.6, 20.8
import fc from "fast-check";
import { FRAME_TABLES } from "../../src/core/animation.js";

/**
 * Loop clamp on dt, in ms. Mirrors the shell's MAX_DT = 1/30 s; defined locally
 * so the core-test generators do not depend on shell modules.
 */
export const MAX_DT_MS = 1000 / 30;

/** Finite stand-in upper bound for `elapsedMs` on Infinity-duration frames (Glide, Death hold). */
export const INFINITE_FRAME_ELAPSED_MAX = 10_000;

/**
 * Exact frame-table boundaries: 60 (Flap squash / Death shake), 120 (Flap
 * squash+stretch, Death eyes-cross), 150 (Idle frame), 200 (full Flap → Glide),
 * 320 (Death shake end → hold frame).
 */
export const FRAME_BOUNDARIES_MS = Object.freeze([60, 120, 150, 200, 320]);

export const ANIM_KINDS = Object.freeze(Object.keys(FRAME_TABLES));
export const GAME_STATES = Object.freeze(["Main_Menu", "Playing", "Paused", "Game_Over"]);

const rotationArb = fc.double({ min: -20, max: 45, noNaN: true });

/** elapsedMs in [0, duration), or [0, 10000] for Infinity-duration frames. */
function elapsedArb(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return fc.double({ min: 0, max: INFINITE_FRAME_ELAPSED_MAX, noNaN: true });
  }
  return fc.oneof(
    fc.constant(0),
    fc.integer({ min: 0, max: durationMs - 1 }),
    fc.double({ min: 0, max: durationMs, maxExcluded: true, noNaN: true }),
  );
}

/** One kind's AnimState: valid frame index and elapsedMs within that frame. */
function animStateOfKindArb(kind) {
  const frames = FRAME_TABLES[kind].frames;
  return fc
    .integer({ min: 0, max: frames.length - 1 })
    .chain((frame) =>
      fc.record({ elapsedMs: elapsedArb(frames[frame].durationMs), rotationDeg: rotationArb }).map(
        ({ elapsedMs, rotationDeg }) => {
          const anim = { kind, frame, elapsedMs, rotationDeg };
          // Death locks rotation at the value it had on entry (R20.12).
          if (kind === "Death") anim.lockedRotationDeg = rotationDeg;
          return anim;
        },
      ),
    );
}

/** Any valid AnimState, across every kind (Idle, Flap, Glide, Death). */
export const animStateArb = fc.oneof(...ANIM_KINDS.map(animStateOfKindArb));

/** A single animation-relevant effect. */
export const animEventArb = fc.oneof(
  fc.constant({ type: "FlapApplied" }),
  fc.constantFrom(...GAME_STATES).map((state) => ({ type: "StateEntered", state })),
);

/** An effect list (possibly empty) as emitted by one stepWorld call. */
export const animEventsArb = fc.array(animEventArb, { maxLength: 4 });

/** A single dt in ms within [0, MAX_DT_MS], biased toward 0 and MAX_DT_MS. */
export const dtMsArb = fc.oneof(
  fc.constant(0),
  fc.constant(MAX_DT_MS),
  fc.integer({ min: 0, max: Math.floor(MAX_DT_MS) }),
  fc.double({ min: 0, max: MAX_DT_MS, noNaN: true }),
);

/**
 * A dt sequence whose running sum hits a frame boundary exactly.
 *
 * Boundaries (60–320 ms) exceed MAX_DT_MS (~33.3 ms), so they cannot be a single
 * dt. Instead the sequence is built from integer chunks in [0, 33] whose sum is
 * exactly the boundary (integers keep the sum exact in floating point). Drawn
 * chunks are consumed greedily, the last one is trimmed to the remainder, and
 * 33 ms steps fill any shortfall.
 */
export const boundaryDtMsSeqArb = fc
  .record({
    target: fc.constantFrom(...FRAME_BOUNDARIES_MS),
    chunks: fc.array(fc.integer({ min: 0, max: 33 }), { maxLength: 20 }),
  })
  .map(({ target, chunks }) => {
    const seq = [];
    let remaining = target;
    for (const c of chunks) {
      if (remaining === 0) break;
      const step = Math.min(c, remaining);
      seq.push(step);
      remaining -= step;
    }
    while (remaining > 0) {
      const step = Math.min(33, remaining);
      seq.push(step);
      remaining -= step;
    }
    return seq;
  });

/**
 * dt sequences in [0, MAX_DT_MS]: either arbitrary steps, or sequences whose
 * cumulative sum lands exactly on a frame boundary (see boundaryDtMsSeqArb).
 */
export const dtMsSeqArb = fc.oneof(
  fc.array(dtMsArb, { maxLength: 40 }),
  boundaryDtMsSeqArb,
);
