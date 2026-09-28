// Feature: flappy-kiro, Property 21: For any step in which a Flap is applied while Playing, the returned effects include a PlaySound "jump"; and for any step that transitions Playing → Game_Over, the returned effects include a PlaySound "gameOver".
// **Validates: Requirements 13.1, 13.2**
//
// Stronger form checked here: PlaySound "jump" is emitted exactly once iff a
// Flap was applied, and PlaySound "gameOver" is emitted exactly once iff the
// step transitioned Playing → Game_Over (never otherwise).
//
// A Flap is applied (independent oracle, from the requirements):
//   - Playing, input.flap, and no togglePause (pause wins, R5.1/R5.2); or
//   - the Main_Menu start transition: panel closed, no panel-opening input
//     (highScoresPressed / toggleBestScore, R18.6), and a start input
//     (startKey, playPressed, or pointer; R2.1, R2.3, R18.7).
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import {
  worldArb,
  collidingWorldArb,
  safeWorldArb,
  dtArb,
  inputFrameArb,
  NO_INPUT,
  GAME_STATES,
} from "../arbitraries/world.js";

const countSound = (effects, sound) => effects.filter((e) => e.type === "PlaySound" && e.sound === sound).length;

/** Independent oracle: was a Flap applied by this step? */
function flapApplied(world, input) {
  if (world.state === "Playing") return Boolean(input.flap) && !input.togglePause;
  if (world.state === "Main_Menu") {
    if (world.menu?.bestScoreOpen) return false;
    if (input.highScoresPressed || input.toggleBestScore) return false;
    return Boolean(input.startKey || input.playPressed || input.pointer);
  }
  return false;
}

// Weight toward Playing so both flap and game-over steps are common.
const caseArb = fc
  .oneof(
    { weight: 3, arbitrary: fc.constant("Playing") },
    { weight: 1, arbitrary: fc.constantFrom(...GAME_STATES) },
  )
  .chain((state) =>
    fc.tuple(
      fc.oneof(worldArb(state), collidingWorldArb(state), safeWorldArb(state)),
      inputFrameArb,
      dtArb,
    ),
  )
  .map(([w, input, dt]) => ({ ...w, input: { ...input }, dt }));

describe("Sound effects on flap and game over", () => {
  it("Property 21: jump iff a Flap is applied; gameOver iff Playing → Game_Over", () => {
    fc.assert(
      fc.property(caseArb, ({ world, config, input, dt }) => {
        const { world: next, effects } = stepWorld(world, input, dt, config);

        const flapped = flapApplied(world, input);
        expect(countSound(effects, "jump")).toBe(flapped ? 1 : 0);
        // FlapApplied accompanies the jump sound one-to-one.
        expect(effects.filter((e) => e.type === "FlapApplied").length).toBe(flapped ? 1 : 0);

        const gameOver = world.state === "Playing" && next.state === "Game_Over";
        expect(countSound(effects, "gameOver")).toBe(gameOver ? 1 : 0);
        expect(effects.some((e) => e.type === "StateEntered" && e.state === "Game_Over")).toBe(gameOver);
      }),
      { numRuns: 500 },
    );
  });

  it("Property 21: a colliding Playing step emits gameOver, plus jump when it also flaps", () => {
    fc.assert(
      fc.property(collidingWorldArb("Playing"), fc.boolean(), ({ world, config }, flap) => {
        // dt = 0 keeps the generated (colliding) position, so the step must end the round.
        const { world: next, effects } = stepWorld(world, { ...NO_INPUT, flap }, 0, config);
        expect(next.state).toBe("Game_Over");
        expect(countSound(effects, "gameOver")).toBe(1);
        expect(countSound(effects, "jump")).toBe(flap ? 1 : 0);
      }),
      { numRuns: 200 },
    );
  });
});
