// Feature: flappy-kiro, Property 4: For any world whose state is not Playing (Main_Menu, Paused, or Game_Over), a flap input never sets the Ghost vertical velocity to Flap_Velocity as a flap and never emits a jump PlaySound or FlapApplied effect. (Note: the Main_Menu → Playing transition applies the first Flap as part of the transition, not as an in-Playing flap.)
// **Validates: Requirements 3.5, 5.5**
//
// Interpretation of the Main_Menu start transition (R2.1, R2.3, R18.5, R18.6):
// a step from Main_Menu that emits StateEntered "Playing" is the start
// transition, which applies the first Flap by design. It is allowed only when
// the frame carries a start input (startKey, playPressed, or pointer), the
// Best_Score_Panel is closed, and no panel-opening input (High Scores / H) is
// present (Back / Esc are no-ops with the panel closed). The `flap` flag by
// itself never starts the game, so any flap-only effect outside that transition
// is a violation. Every other non-Playing step emits no FlapApplied /
// PlaySound "jump" and leaves ghost.vy unchanged (Paused → Playing resume keeps
// the preserved velocity, R5.4), except the Game_Over → Main_Menu reset, whose
// reset velocity must not be Flap_Velocity.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb, NO_INPUT } from "../arbitraries/world.js";

const NON_PLAYING = ["Main_Menu", "Paused", "Game_Over"];
// With the panel closed, only panel-opening inputs block a start (R18.6);
// Back / Esc do nothing there.
const PANEL_OPEN_FLAGS = ["highScoresPressed", "toggleBestScore"];

const isFlapEffect = (e) => e.type === "FlapApplied" || (e.type === "PlaySound" && e.sound === "jump");
const entersPlaying = (effects) => effects.some((e) => e.type === "StateEntered" && e.state === "Playing");

/** Non-Playing world with an input frame that always has flap = true. */
const caseArb = fc
  .constantFrom(...NON_PLAYING)
  .chain((state) => fc.tuple(worldArb(state), inputFrameArb, dtArb))
  .map(([w, input, dt]) => ({ ...w, input: { ...input, flap: true }, dt }));

describe("Flap only applies while Playing", () => {
  it("Property 4: a flap input outside Playing never flaps, except as the Main_Menu start transition", () => {
    fc.assert(
      fc.property(caseArb, ({ world, config, input, dt }) => {
        const before = world.ghost.vy;
        const { world: next, effects } = stepWorld(world, input, dt, config);
        const flapEffects = effects.filter(isFlapEffect);

        if (world.state === "Main_Menu" && entersPlaying(effects)) {
          // Only the Main_Menu start transition may apply the (single) first Flap.
          expect(world.state).toBe("Main_Menu");
          expect(input.startKey || input.playPressed || input.pointer).toBe(true);
          expect(world.menu.bestScoreOpen).toBe(false);
          expect(PANEL_OPEN_FLAGS.some((f) => input[f])).toBe(false);
          expect(effects.filter((e) => e.type === "FlapApplied")).toHaveLength(1);
          expect(next.ghost.vy).toBe(config.physics.flapVelocity);
          return;
        }

        // Not a start transition: the flap flag must have no effect.
        expect(flapEffects).toEqual([]);
        if (world.state === "Game_Over" && next.state === "Main_Menu") {
          // Restart resets the Ghost to its menu pose (R10.2); that is not a Flap.
          expect(next.ghost.vy).not.toBe(config.physics.flapVelocity);
        } else {
          // Includes Paused → Playing resume (R5.4), which preserves velocity.
          expect(next.ghost.vy).toBe(before);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("Property 4: `flap` alone never starts the game or flaps in any non-Playing state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_PLAYING).chain((state) => fc.tuple(worldArb(state), dtArb)),
        ([{ world, config }, dt]) => {
          const before = world.ghost.vy;
          const { world: next, effects } = stepWorld(world, { ...NO_INPUT, flap: true }, dt, config);
          expect(effects.filter(isFlapEffect)).toEqual([]);
          expect(entersPlaying(effects)).toBe(false);
          expect(next.state).toBe(world.state);
          expect(next.ghost.vy).toBe(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
