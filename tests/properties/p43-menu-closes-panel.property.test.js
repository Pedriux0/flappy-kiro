// Feature: flappy-kiro, Property 43: For any Game_Over world with any menu value and any restart input, the resulting Main_Menu world has menu.bestScoreOpen = false; and for any config, play area, high score, and RNG, createInitialWorld returns menu.bestScoreOpen = false.
// **Validates: Requirements 18.9**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createInitialWorld } from "../../src/core/world.js";
import { stepWorld } from "../../src/core/step.js";
import { createRng } from "../../src/core/rng.js";
import { validConfigArb } from "../arbitraries/config.js";
import { worldArb, playAreaArb, inputFrameArb, dtArb } from "../arbitraries/world.js";

const RESTART_FLAGS = ["pointer", "startKey", "restart"];

/** Any InputFrame with at least one restart trigger (pointer / startKey / restart) set. */
const restartInputArb = fc
  .record({ base: inputFrameArb, flags: fc.subarray(RESTART_FLAGS, { minLength: 1 }) })
  .map(({ base, flags }) => {
    const frame = { ...base };
    for (const f of flags) frame[f] = true;
    return frame;
  });

describe("Property 43: Entering Main_Menu closes the panel", () => {
  it("createInitialWorld always starts in Main_Menu with the panel closed", () => {
    fc.assert(
      fc.property(
        validConfigArb,
        playAreaArb,
        fc.nat({ max: 10_000 }),
        fc.integer(),
        (config, playArea, highScore, seed) => {
          const world = createInitialWorld(config, playArea, highScore, createRng(seed));
          expect(world.state).toBe("Main_Menu");
          expect(world.menu.bestScoreOpen).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Game_Over → Main_Menu closes the panel, whatever its prior value", () => {
    fc.assert(
      fc.property(worldArb("Game_Over"), restartInputArb, dtArb, ({ world, config }, input, dt) => {
        const { world: next, effects } = stepWorld(world, input, dt, config);
        expect(next.state).toBe("Main_Menu");
        expect(effects).toContainEqual({ type: "StateEntered", state: "Main_Menu" });
        expect(next.menu.bestScoreOpen).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("Game_Over worlds that had the panel open still enter Main_Menu with it closed", () => {
    fc.assert(
      fc.property(
        worldArb("Game_Over", { bestScoreOpen: true }),
        restartInputArb,
        dtArb,
        ({ world, config }, input, dt) => {
          const { world: next } = stepWorld(world, input, dt, config);
          expect(next.state).toBe("Main_Menu");
          expect(next.menu.bestScoreOpen).toBe(false);
          expect(world.menu.bestScoreOpen).toBe(true); // input not mutated
        },
      ),
      { numRuns: 100 },
    );
  });
});
