import { describe, it, expect } from "vitest";
import { fitRect } from "../../src/core/sprite.js";

describe("fitRect", () => {
  it("fits ghosty.png (1290×1567) into a 32 cell as ~26.3×32, centred horizontally", () => {
    const r = fitRect(1290, 1567, 32);
    expect(r.height).toBeCloseTo(32, 10);
    expect(r.width).toBeCloseTo((1290 * 32) / 1567, 10);
    expect(r.width).toBeCloseTo(26.3, 1);
    expect(r.y).toBeCloseTo(0, 10);
    expect(r.x).toBeCloseTo((32 - r.width) / 2, 10);
  });

  it("fills the width and centres vertically for a wide source", () => {
    const r = fitRect(200, 100, 32);
    expect(r).toEqual({ x: 0, y: 8, width: 32, height: 16 });
  });

  it("fills the whole cell for a square source", () => {
    expect(fitRect(64, 64, 32)).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});
