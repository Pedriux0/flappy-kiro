// Feature: flappy-kiro, Property 6: For any Main_Menu world with the Best_Score_Panel closed and any prior score, and any start input (startKey from Space or Enter, playPressed, or a generic pointer) with no panel input in the same frame, stepping transitions the world to Playing, sets the score to 0, sets the Ghost vertical velocity to config.physics.flapVelocity from the config passed to stepWorld, and emits FlapApplied and PlaySound "jump".
// **Validates: Requirements 2.1, 2.2, 2.3, 18.7, 20.2**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, NO_INPUT } from "../arbitraries/world.js";

const START_FLAGS = ["startKey", "playPressed", "pointer"];
// Flags that are not panel inputs while the panel is closed (highScoresPressed /
// toggleBestScore open the panel and win over start inputs, R18.6).
const OTHER_FLAGS = ["flap", "backPressed", "escape", "togglePause", "restart"];

/** Frames with at least one start flag, no panel-opening flag, and any other flags. */
const startInputArb = fc
  .record({
    start: fc.subarray(START_FLAGS, { minLength: 1 }),
    other: fc.subarray(OTHER_FLAGS),
  })
  .map(({ start, other }) => {
    const frame = { ...NO_INPUT };
    for (const f of [...start, ...other]) frame[f] = true;
    return frame;
  });

// Menu worlds with the panel closed; the generator also yields arbitrary prior
// scores, pipes, and passed sets, so the reset is exercised on dirty worlds.
const menuWorldArb = worldArb("Main_Menu", { bestScoreOpen: false });

describe("Property 6: Start transition resets score and applies first flap", () => {
  it("start input on a closed-panel Main_Menu enters Playing with score 0 and vy = flapVelocity", () => {
    fc.assert(
      fc.property(menuWorldArb, startInputArb, dtArb, ({ world, config }, input, dt) => {
        const ghostBefore = { ...world.ghost };
        const { world: next, effects } = stepWorld(world, input, dt, config);

        expect(next.state).toBe("Playing");
        expect(next.score).toBe(0);
        expect(next.ghost.vy).toBe(config.physics.flapVelocity);
        // First Flap only: no integration on the start frame (R2.3, R20.2).
        expect(next.ghost.x).toBe(ghostBefore.x);
        expect(next.ghost.y).toBe(ghostBefore.y);
        // Clean round start.
        expect(next.pipes).toEqual([]);
        expect(next.passed.size).toBe(0);
        expect(next.pipeSpeed).toBe(config.basePipeSpeed);
        expect(next.speedTier).toBe(0);
        // Unrelated fields carry over.
        expect(next.highScore).toBe(world.highScore);
        expect(next.muted).toBe(world.muted);

        expect(effects).toContainEqual({ type: "FlapApplied" });
        expect(effects).toContainEqual({ type: "PlaySound", sound: "jump" });
        expect(effects).toEqual([
          { type: "FlapApplied" },
          { type: "PlaySound", sound: "jump" },
          { type: "StateEntered", state: "Playing" },
        ]);

        // Input world is not mutated.
        expect(world.state).toBe("Main_Menu");
        expect(world.ghost).toEqual(ghostBefore);
      }),
      { numRuns: 200 },
    );
  });
});
