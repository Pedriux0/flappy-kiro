import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatScoreDisplay } from "../../src/core/format.js";

describe("Score display", () => {
  // Feature: flappy-kiro, Property 18: Score display round-trips non-negative integers
  // For any non-negative integer current score and high score, the formatted
  // Score_Display text ("Score: N | High: M") contains values that parse back
  // to exactly those integers.
  // **Validates: Requirements 11.2, 11.3**
  it("Property 18: formatted text parses back to the same score and high score", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: Number.MAX_SAFE_INTEGER }),
        fc.nat({ max: Number.MAX_SAFE_INTEGER }),
        (score, highScore) => {
          const text = formatScoreDisplay(score, highScore);
          const match = /^Score: (\d+) \| High: (\d+)$/.exec(text);
          expect(match).not.toBeNull();
          expect(Number.parseInt(match[1], 10)).toBe(score);
          expect(Number.parseInt(match[2], 10)).toBe(highScore);
        }
      ),
      { numRuns: 200 }
    );
  });
});
