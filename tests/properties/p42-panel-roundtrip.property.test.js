// Feature: flappy-kiro, Property 42: For any Main_Menu world W with the panel closed, an open input (highScoresPressed or toggleBestScore) yields W with menu.bestScoreOpen = true and nothing else changed; following it with any close input (backPressed, escape, or toggleBestScore) yields a world equal to W.
// **Validates: Requirements 18.2, 18.4**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, INPUT_FLAGS } from "../arbitraries/world.js";

const OPEN_FLAGS = ["highScoresPressed", "toggleBestScore"];
const CLOSE_FLAGS = ["backPressed", "escape", "toggleBestScore"];

/** Any combination of flags with at least one of `required` set (panel inputs win over start flags, R18.6). */
const frameWithArb = (required) =>
  fc
    .record({
      rest: fc.record(Object.fromEntries(INPUT_FLAGS.map((f) => [f, fc.boolean()]))),
      set: fc.subarray(required, { minLength: 1 }),
    })
    .map(({ rest, set }) => {
      const frame = { ...rest };
      for (const f of set) frame[f] = true;
      return frame;
    });

const openFrameArb = frameWithArb(OPEN_FLAGS);
const closeFrameArb = frameWithArb(CLOSE_FLAGS);

describe("Best_Score_Panel round trip", () => {
  it("Property 42: opening then closing the panel returns the original world", () => {
    fc.assert(
      fc.property(
        worldArb("Main_Menu", { bestScoreOpen: false }),
        openFrameArb,
        closeFrameArb,
        dtArb,
        dtArb,
        ({ world, config }, openFrame, closeFrame, dt1, dt2) => {
          const opened = stepWorld(world, openFrame, dt1, config);
          expect(opened.effects).toEqual([]);
          expect(opened.world).toEqual({ ...world, menu: { ...world.menu, bestScoreOpen: true } });

          const closed = stepWorld(opened.world, closeFrame, dt2, config);
          expect(closed.effects).toEqual([]);
          expect(closed.world).toEqual(world);
        },
      ),
      { numRuns: 200 },
    );
  });
});
