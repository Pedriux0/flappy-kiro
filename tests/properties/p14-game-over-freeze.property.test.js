// Feature: flappy-kiro, Property 14: For any Game_Over world and any Delta_Time, stepping leaves every Pipe_Pair's horizontal position unchanged and leaves the Ghost vertical position unchanged.
// **Validates: Requirements 8.4, 8.5**
//
// Frames that leave Game_Over (pointer, startKey, or restart → Main_Menu, R10.2–10.5)
// reset the world by design, so the freeze is asserted on every frame that keeps the
// world in Game_Over, and the sequence stops once the world leaves Game_Over.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb, NO_INPUT } from "../arbitraries/world.js";

const EXIT_FLAGS = ["pointer", "startKey", "restart"];
const leavesGameOver = (input) => EXIT_FLAGS.some((f) => input[f]);

/** Any InputFrame with the Game_Over exit flags cleared (flap, escape, togglePause, … may be set). */
const stayInputArb = inputFrameArb.map((input) => ({
  ...NO_INPUT,
  ...input,
  pointer: false,
  startKey: false,
  restart: false,
}));

/** Pipe horizontal positions keyed by id, and the Ghost vertical position. */
const frozenParts = (w) => ({
  pipeXs: w.pipes.map((p) => [p.id, p.x]),
  ghostY: w.ghost.y,
});

describe("Game_Over freezes the world", () => {
  it("Property 14: stepping a Game_Over world with any dt leaves pipe x positions and Ghost y unchanged", () => {
    fc.assert(
      fc.property(
        worldArb("Game_Over"),
        fc.array(fc.tuple(dtArb, stayInputArb), { minLength: 1, maxLength: 20 }),
        ({ world, config }, frames) => {
          const before = frozenParts(world);
          let w = world;
          for (const [dt, input] of frames) {
            const { world: next, effects } = stepWorld(w, input, dt, config);
            expect(next.state).toBe("Game_Over");
            expect(frozenParts(next)).toEqual(before); // R8.4, R8.5
            expect(effects).toEqual([]);
            w = next;
          }
          expect(frozenParts(world)).toEqual(before); // input never mutated
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Property 14: freeze holds for mixed inputs until the world leaves Game_Over", () => {
    fc.assert(
      fc.property(
        worldArb("Game_Over"),
        fc.array(fc.tuple(dtArb, inputFrameArb), { minLength: 1, maxLength: 20 }),
        ({ world, config }, frames) => {
          const before = frozenParts(world);
          let w = world;
          for (const [dt, input] of frames) {
            const { world: next } = stepWorld(w, input, dt, config);
            if (leavesGameOver(input)) {
              expect(next.state).toBe("Main_Menu");
              break;
            }
            expect(next.state).toBe("Game_Over");
            expect(frozenParts(next)).toEqual(before);
            w = next;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
