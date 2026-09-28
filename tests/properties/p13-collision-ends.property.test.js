// Feature: flappy-kiro, Property 13: For any Playing world and config, after the frame's movement, if the Ghost Hitbox (centre (x, y), radius config.ghostHitboxRadius) intersects any top or bottom pipe rectangle, or y + r > groundY, or y − r < ceilingY, stepping transitions the world to Game_Over; if none of these hold (including exact contact y + r == groundY or y − r == ceilingY), it does not. For any world in Main_Menu, Paused, or Game_Over, no Ghost overlap with a pipe, the Ground, or the Ceiling ever causes a transition to Game_Over.
// **Validates: Requirements 8.1, 8.2, 8.3, 19.4, 19.6, 19.7, 19.11**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import {
  worldArb,
  collidingWorldArb,
  exactContactWorldArb,
  dtArb,
  inputFrameArb,
  NO_INPUT,
  COLLISION_KINDS,
  CONTACT_KINDS,
  referenceCollides,
} from "../arbitraries/world.js";

const RUNS = { numRuns: 200 };

const isGameOverEffect = (e) =>
  (e.type === "StateEntered" && e.state === "Game_Over") || (e.type === "PlaySound" && e.sound === "gameOver");

/** Frames that neither pause nor flap: a dt = 0 Playing step then keeps the generated positions. */
const stillInputArb = inputFrameArb.map((f) => ({ ...f, flap: false, togglePause: false }));
/** Frames that do not pause, so the full Playing pipeline runs. */
const noPauseInputArb = inputFrameArb.map((f) => ({ ...f, togglePause: false }));

describe("Property 13: Any collision ends the game", () => {
  it("strictly overlapping Playing worlds (pipe/ground/ceiling) enter Game_Over on a dt = 0 step", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COLLISION_KINDS).chain((kind) => collidingWorldArb("Playing", kind)),
        stillInputArb,
        ({ world, config }, input) => {
          const r = config.ghostHitboxRadius;
          expect(referenceCollides(world.ghost, world.pipes, world.playArea, r)).toBe(true);
          const { world: next, effects } = stepWorld(world, input, 0, config);
          expect(next.state).toBe("Game_Over");
          expect(effects.some((e) => e.type === "StateEntered" && e.state === "Game_Over")).toBe(true);
        },
      ),
      RUNS,
    );
  });

  it("exact contact (distance == r) in Playing does not end the game", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONTACT_KINDS).chain((kind) => exactContactWorldArb("Playing", kind)),
        stillInputArb,
        ({ world, config }, input) => {
          const r = config.ghostHitboxRadius;
          expect(referenceCollides(world.ghost, world.pipes, world.playArea, r)).toBe(false);
          const { world: next, effects } = stepWorld(world, input, 0, config);
          expect(next.state).toBe("Playing");
          expect(effects.some(isGameOverEffect)).toBe(false);
        },
      ),
      RUNS,
    );
  });

  it("any Playing world: dt = 0 step ends the game iff the reference detects a collision", () => {
    fc.assert(
      fc.property(worldArb("Playing"), stillInputArb, ({ world, config }, input) => {
        const r = config.ghostHitboxRadius;
        const { world: next } = stepWorld(world, input, 0, config);
        const expected = referenceCollides(next.ghost, next.pipes, next.playArea, r);
        expect(next.state === "Game_Over").toBe(expected);
      }),
      RUNS,
    );
  });

  it("any Playing world with dt > 0: Game_Over iff the moved Ghost collides with the moved pipes", () => {
    fc.assert(
      fc.property(worldArb("Playing"), noPauseInputArb, dtArb, ({ world, config }, input, dt) => {
        const r = config.ghostHitboxRadius;
        const { world: next, effects } = stepWorld(world, input, dt, config);
        const expected = referenceCollides(next.ghost, next.pipes, next.playArea, r);
        expect(next.state === "Game_Over").toBe(expected);
        expect(effects.some((e) => e.type === "StateEntered" && e.state === "Game_Over")).toBe(expected);
      }),
      RUNS,
    );
  });

  it("overlap in Main_Menu, Paused, or Game_Over never causes a transition to Game_Over", () => {
    fc.assert(
      fc.property(
        fc
          .constantFrom("Main_Menu", "Paused", "Game_Over")
          .chain((state) =>
            fc.oneof(collidingWorldArb(state), exactContactWorldArb(state), worldArb(state, { variant: "any" })),
          ),
        fc.oneof(fc.constant({ ...NO_INPUT }), inputFrameArb),
        dtArb,
        ({ world, config }, input, dt) => {
          const { world: next, effects } = stepWorld(world, input, dt, config);
          expect(effects.some(isGameOverEffect)).toBe(false);
          if (world.state !== "Game_Over") expect(next.state).not.toBe("Game_Over");
          // Game_Over stays frozen (or leaves for Main_Menu); it is never re-entered.
          if (world.state === "Game_Over") expect(["Game_Over", "Main_Menu"]).toContain(next.state);
        },
      ),
      RUNS,
    );
  });
});
