// Feature: flappy-kiro, Property 16: For any Game_Over world, a click/tap (pointer), startKey (Space or Enter), or restart input transitions the world to Main_Menu with the Ghost at its starting position, Ghost vertical velocity 0, no active Pipe_Pairs, and score 0.
// **Validates: Requirements 10.2, 10.3, 10.4, 10.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb } from "../arbitraries/world.js";

const RESTART_FLAGS = ["pointer", "startKey", "restart"];

/** Any InputFrame with at least one restart trigger (pointer / startKey / restart) set. */
const restartInputArb = fc
  .record({ base: inputFrameArb, triggers: fc.subarray(RESTART_FLAGS, { minLength: 1 }) })
  .map(({ base, triggers }) => {
    const frame = { ...base };
    for (const f of triggers) frame[f] = true;
    return frame;
  });

describe("Property 16: Restart resets to a clean Main_Menu", () => {
  it("pointer / startKey / restart in Game_Over yields a clean Main_Menu", () => {
    fc.assert(
      fc.property(worldArb("Game_Over"), restartInputArb, dtArb, ({ world, config }, input, dt) => {
        const before = {
          score: world.score,
          pipes: world.pipes.length,
          highScore: world.highScore,
          passed: world.passed.size,
          ghost: { ...world.ghost },
        };

        const { world: next, effects } = stepWorld(world, input, dt, config);

        // R10.2: transitions to Main_Menu.
        expect(next.state).toBe("Main_Menu");
        expect(effects).toContainEqual({ type: "StateEntered", state: "Main_Menu" });

        // R10.3: Ghost at start position with vy 0.
        const { width, height } = world.playArea;
        expect(next.ghost.x).toBe(config.ghostStartXRatio * width);
        expect(next.ghost.y).toBe(config.ghostStartYRatio * height);
        expect(next.ghost.vy).toBe(0);
        expect(next.ghost.width).toBe(config.ghostWidth);
        expect(next.ghost.height).toBe(config.ghostHeight);

        // R10.4: no active Pipe_Pairs.
        expect(next.pipes).toEqual([]);

        // R10.5: score 0 (and the scored-pair set / difficulty reset with it).
        expect(next.score).toBe(0);
        expect(next.passed.size).toBe(0);
        expect(next.pipeSpeed).toBe(config.basePipeSpeed);
        expect(next.speedTier).toBe(0);
        expect(next.menu.bestScoreOpen).toBe(false);

        // Session-level state survives the restart.
        expect(next.highScore).toBe(world.highScore);
        expect(next.muted).toBe(world.muted);
        expect(next.playArea).toEqual(world.playArea);

        // Pure: the input world is not mutated.
        expect(world.state).toBe("Game_Over");
        expect(world.score).toBe(before.score);
        expect(world.pipes.length).toBe(before.pipes);
        expect(world.highScore).toBe(before.highScore);
        expect(world.passed.size).toBe(before.passed);
        expect(world.ghost).toEqual(before.ghost);
      }),
      { numRuns: 200 },
    );
  });
});
