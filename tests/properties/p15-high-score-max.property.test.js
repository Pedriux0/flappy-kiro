// Feature: flappy-kiro, Property 15: For any Playing world with score S and high score H, transitioning to Game_Over sets the high score to max(S, H) (increasing it only when S > H), and emits a PersistHighScore effect with that integer value exactly when the high score increased.
// **Validates: Requirements 9.1, 9.2, 9.3**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { collidingWorldArb, NO_INPUT } from "../arbitraries/world.js";

/**
 * (S, H) pairs covering S > H, S === H, and S < H, including zeros.
 * The generated world's score is overridden with S; score is only read as a
 * number here (dt = 0 and no flap, so no new pair is passed this frame and the
 * post-scoring score stays S).
 */
const scoresArb = fc.oneof(
  fc.record({ s: fc.nat({ max: 500 }), h: fc.nat({ max: 500 }) }),
  fc.nat({ max: 500 }).map((n) => ({ s: n, h: n })),
  fc.nat({ max: 500 }).chain((h) => fc.integer({ min: h + 1, max: h + 500 }).map((s) => ({ s, h }))),
  fc.nat({ max: 500 }).chain((s) => fc.integer({ min: s + 1, max: s + 500 }).map((h) => ({ s, h }))),
);

describe("Property 15: High score becomes the maximum on Game_Over", () => {
  it("Game_Over high score is max(S, H); PersistHighScore emitted exactly when it increased", () => {
    fc.assert(
      fc.property(collidingWorldArb("Playing"), scoresArb, ({ world, config }, { s, h }) => {
        const start = { ...world, score: s, highScore: h };
        const { world: next, effects } = stepWorld(start, NO_INPUT, 0, config);

        expect(next.state).toBe("Game_Over");
        // S is the score after this frame's scoring step (unchanged at dt = 0).
        const S = next.score;
        expect(S).toBe(s);

        const expected = Math.max(S, h);
        expect(next.highScore).toBe(expected);
        expect(Number.isInteger(next.highScore)).toBe(true);
        // Never decreases; increases only when S > H.
        expect(next.highScore >= h).toBe(true);
        expect(next.highScore > h).toBe(S > h);

        const persists = effects.filter((e) => e.type === "PersistHighScore");
        if (S > h) {
          expect(persists).toHaveLength(1);
          expect(persists[0].value).toBe(expected);
          expect(Number.isInteger(persists[0].value)).toBe(true);
        } else {
          expect(persists).toHaveLength(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});
