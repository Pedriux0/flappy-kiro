// Feature: flappy-kiro, Property 41: For any Main_Menu world and any InputFrame: if the panel is open, or the frame contains highScoresPressed or (with the panel closed) toggleBestScore, then stepping leaves the state as Main_Menu, leaves the Ghost, pipes, and score unchanged, and emits no FlapApplied, PlaySound "jump", or StateEntered "Playing" effect. If the panel is open and the frame has none of backPressed, escape, toggleBestScore, the panel stays open and the world is unchanged.
// **Validates: Requirements 18.5, 18.6, 18.11**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb, NO_INPUT } from "../arbitraries/world.js";

const CLOSE_FLAGS = ["backPressed", "escape", "toggleBestScore"];

const isForbidden = (e) =>
  e.type === "FlapApplied" ||
  (e.type === "PlaySound" && e.sound === "jump") ||
  (e.type === "StateEntered" && e.state === "Playing");

/** A Main_Menu step is panel-governed when the panel is open or the frame opens it. */
const panelGoverned = (world, input) =>
  world.menu.bestScoreOpen || input.highScoresPressed || input.toggleBestScore;

/** Frames that always carry a panel-opening flag, plus arbitrary start flags (R18.6). */
const openingFrameArb = fc
  .tuple(inputFrameArb, fc.constantFrom("highScoresPressed", "toggleBestScore"))
  .map(([input, flag]) => ({ ...input, [flag]: true }));

/** Frames with no close flag, so an open panel must ignore them entirely (R18.5). */
const nonClosingFrameArb = inputFrameArb.map((input) => {
  const frame = { ...input };
  for (const f of CLOSE_FLAGS) frame[f] = false;
  return frame;
});

function assertNoStart(world, next, effects) {
  expect(next.state).toBe("Main_Menu");
  expect(next.ghost).toEqual(world.ghost);
  expect(next.pipes).toEqual(world.pipes);
  expect(next.score).toBe(world.score);
  expect(effects.filter(isForbidden)).toEqual([]);
}

describe("Best_Score_Panel never starts a game or flaps", () => {
  it("Property 41: panel-governed Main_Menu steps never start, flap, or change Ghost/pipes/score", () => {
    const caseArb = fc.oneof(
      // Any Main_Menu world with any frame (filtered to panel-governed below).
      fc.tuple(worldArb("Main_Menu"), inputFrameArb, dtArb),
      // Panel closed with an opening flag, often alongside start flags.
      fc.tuple(worldArb("Main_Menu", { bestScoreOpen: false }), openingFrameArb, dtArb),
      // Panel open with any frame.
      fc.tuple(worldArb("Main_Menu", { bestScoreOpen: true }), inputFrameArb, dtArb),
    );
    fc.assert(
      fc.property(caseArb, ([{ world, config }, input, dt]) => {
        fc.pre(panelGoverned(world, input));
        const { world: next, effects } = stepWorld(world, input, dt, config);
        assertNoStart(world, next, effects);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 41: with the panel open, a frame without Back/Esc/H leaves the panel open and the world unchanged", () => {
    fc.assert(
      fc.property(
        worldArb("Main_Menu", { bestScoreOpen: true }),
        fc.oneof(nonClosingFrameArb, fc.constant({ ...NO_INPUT })),
        dtArb,
        ({ world, config }, input, dt) => {
          const { world: next, effects } = stepWorld(world, input, dt, config);
          expect(next.menu.bestScoreOpen).toBe(true);
          expect(next).toEqual(world);
          expect(effects).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
