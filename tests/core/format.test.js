import { describe, it, expect } from "vitest";
import { formatScoreDisplay } from "../../src/core/format.js";

describe("formatScoreDisplay", () => {
  it("formats score and high score with labels", () => {
    expect(formatScoreDisplay(3, 12)).toBe("Score: 3 | High: 12");
  });

  it("shows 0 for the initial Main_Menu score", () => {
    expect(formatScoreDisplay(0, 0)).toBe("Score: 0 | High: 0");
  });

  it("handles the maximum high score without exponent notation", () => {
    expect(formatScoreDisplay(0, 999999999)).toBe("Score: 0 | High: 999999999");
  });

  it("coerces invalid values to non-negative integers", () => {
    expect(formatScoreDisplay(-5, NaN)).toBe("Score: 0 | High: 0");
    expect(formatScoreDisplay(4.9, Infinity)).toBe("Score: 4 | High: 0");
  });
});
