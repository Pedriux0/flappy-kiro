// Feature: flappy-kiro, Property 33: For any positive source width and height and cell size 32, fitRect(srcW, srcH, 32) returns a rect whose width and height equal srcW · s and srcH · s for the single factor s = min(32 / srcW, 32 / srcH), whose longer side equals 32 and shorter side is ≤ 32, whose width-to-height ratio matches srcW / srcH within 1 px after rounding, and which is centred in the cell (x = (32 − width) / 2, y = (32 − height) / 2).
// **Validates: Requirements 19.2**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { fitRect } from "../../src/core/sprite.js";

const CELL = 32;
const EPS = 1e-9;

// Positive source dimensions: realistic image sizes, including fractional values.
const srcDim = fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true });

describe("Property 33: Sprite fitting is uniform, fills the longer side, and is centred", () => {
  it("scales uniformly by s = min(cell/srcW, cell/srcH), fills the longer side, and centres", () => {
    fc.assert(
      fc.property(srcDim, srcDim, (srcW, srcH) => {
        const r = fitRect(srcW, srcH, CELL);
        const s = Math.min(CELL / srcW, CELL / srcH);

        // Single uniform scale factor.
        expect(Math.abs(r.width - srcW * s)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(r.height - srcH * s)).toBeLessThanOrEqual(EPS);

        // Longer side fills the cell; shorter side fits inside it.
        const longer = Math.max(r.width, r.height);
        const shorter = Math.min(r.width, r.height);
        expect(Math.abs(longer - CELL)).toBeLessThanOrEqual(EPS);
        expect(shorter).toBeLessThanOrEqual(CELL + EPS);
        expect(shorter).toBeGreaterThan(0);

        // Aspect ratio preserved within 1 px after rounding.
        expect(Math.abs(Math.round(r.width) - Math.round((r.height * srcW) / srcH))).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.round(r.height) - Math.round((r.width * srcH) / srcW))).toBeLessThanOrEqual(1);

        // Centred in the cell.
        expect(Math.abs(r.x - (CELL - r.width) / 2)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(r.y - (CELL - r.height) / 2)).toBeLessThanOrEqual(EPS);
        expect(r.x).toBeGreaterThanOrEqual(-EPS);
        expect(r.y).toBeGreaterThanOrEqual(-EPS);
      }),
      { numRuns: 200 },
    );
  });
});
