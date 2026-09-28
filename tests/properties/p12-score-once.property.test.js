// Feature: flappy-kiro, Property 12: For any sequence of Playing steps, the score equals the number of distinct Pipe_Pairs whose trailing edge the Ghost has passed, and re-stepping never increments the score for a pair already counted.
// **Validates: Requirements 7.1, 7.2**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { safeWorldArb, dtArb, NO_INPUT, MAX_DT } from "../arbitraries/world.js";

/**
 * "Cruise" setup so runs actually pass pipes instead of ending on a collision:
 * zero gravity and vy, no flaps (the Ghost holds its height), and every live
 * pair's Gap re-centred on the Ghost (gapHeight >= 100 > 2r, so the Hitbox stays
 * inside the Gap). Newly spawned pairs use their own gapY and may still end the run.
 */
const cruiseArb = safeWorldArb("Playing").map(({ world, config }) => {
  const { ceilingY, groundY } = world.playArea;
  const pipes = world.pipes.map((p) => ({
    ...p,
    gapY: Math.min(Math.max(world.ghost.y - p.gapHeight / 2, ceilingY), groundY - p.gapHeight),
  }));
  return {
    world: { ...world, ghost: { ...world.ghost, vy: 0 }, pipes },
    config: { ...config, physics: { ...config.physics, gravity: 0 } },
    cruise: true,
  };
});

const setupArb = fc.oneof(
  safeWorldArb("Playing").map(({ world, config }) => ({ world, config, cruise: false })),
  cruiseArb,
);
// A run: per-frame dt plus whether the player flaps that frame (flaps dropped in cruise runs).
const runFramesArb = fc.array(fc.record({ dt: dtArb, flap: fc.boolean() }), { minLength: 1, maxLength: 90 });

describe("Property 12: Each pipe is scored exactly once", () => {
  it("score delta equals newly passed pair ids; no pair is counted twice", () => {
    fc.assert(
      fc.property(setupArb, runFramesArb, ({ world: initial, config, cruise }, runFrames) => {
        // Cruise runs also get a long tail of full frames so pipes actually reach the Ghost.
        const frames = cruise
          ? [...runFrames, ...Array.from({ length: 120 }, () => ({ dt: MAX_DT }))].map((f) => ({ ...f, flap: false }))
          : runFrames;
        const initialPassed = new Set(initial.passed);
        const initialScore = initial.score;
        // Every id the test has seen counted during the run (including the initial ones).
        const counted = new Set(initialPassed);

        let world = initial;
        for (const { dt, flap } of frames) {
          if (world.state !== "Playing") break; // Game_Over (collision) ends the run.
          const prev = world;
          const prevById = new Map(prev.pipes.map((p) => [p.id, p]));
          ({ world } = stepWorld(prev, { ...NO_INPUT, flap }, dt, config));

          const prevPassed = new Set(prev.passed);
          const nextPassed = new Set(world.passed);
          const newIds = [...nextPassed].filter((id) => !prevPassed.has(id));

          // Passed set only grows; a counted pair never leaves it.
          for (const id of prevPassed) expect(nextPassed.has(id)).toBe(true);

          // Score delta == number of newly passed ids (each contributes exactly one point).
          expect(world.score - prev.score).toBe(newIds.length);

          // A newly counted pair must have been a live pair whose trailing edge the
          // moved Ghost passed (scoring uses pre-scroll pipe positions), and must
          // never have been counted before in this session.
          for (const id of newIds) {
            expect(counted.has(id)).toBe(false);
            const p = prevById.get(id);
            expect(p).toBeDefined();
            expect(world.ghost.x > p.x + p.width).toBe(true);
            counted.add(id);
          }

          // Every surviving pair whose trailing edge the Ghost passed this frame is counted.
          for (const p of world.pipes) {
            const before = prevById.get(p.id);
            if (before && world.ghost.x > before.x + before.width) {
              expect(nextPassed.has(p.id)).toBe(true);
            }
            // scored flag agrees with the passed set.
            expect(p.scored).toBe(nextPassed.has(p.id));
          }

          // Cumulative: score equals the number of distinct pairs counted this session.
          expect(world.score - initialScore).toBe(counted.size - initialPassed.size);
          expect(nextPassed.size).toBe(counted.size);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("re-stepping a world whose pairs are all passed never increments the score", () => {
    fc.assert(
      fc.property(safeWorldArb("Playing"), fc.integer({ min: 1, max: 5 }), ({ world, config }, repeats) => {
        // dt = 0 without flap: nothing moves (a spawn lands at x = width, clear of the Ghost),
        // so the only way the score could change is re-counting an already counted pair.
        let w = world;
        for (let i = 0; i < repeats; i++) {
          const before = w.score;
          const beforePassed = new Set(w.passed);
          ({ world: w } = stepWorld(w, NO_INPUT, 0, config));
          const gained = [...new Set(w.passed)].filter((id) => !beforePassed.has(id)).length;
          expect(w.score - before).toBe(gained);
          for (const p of w.pipes) if (beforePassed.has(p.id)) expect(p.scored).toBe(true);
        }
        // Initial world has scored === passed-trailing-edge, so a dt = 0 re-step adds nothing.
        expect(w.score).toBe(world.score);
      }),
      { numRuns: 200 }
    );
  });
});
