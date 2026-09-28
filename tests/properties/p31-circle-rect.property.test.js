// Feature: flappy-kiro, Property 31: For any circle (any centre, radius in [8, 16]) and any rectangle with non-negative width and height, circleIntersectsRect(circle, rect) returns true exactly when a brute-force reference, the minimum Euclidean distance from the centre to the closed rectangle (0 if the centre is inside), is strictly less than r. For any rectangle and radius, a circle whose centre is placed at distance exactly r from the rectangle (generated axis-aligned beside an edge, where the arithmetic is exact) returns false.
// **Validates: Requirements 8.1, 8.2, 8.3, 19.5, 19.6, 19.7**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { circleIntersectsRect } from "../../src/core/collision.js";

// Dyadic values (multiples of 1/4) keep every sum, difference, and square exact in doubles.
const QUARTER = 4;
const dyadic = (min, max) =>
  fc.integer({ min: min * QUARTER, max: max * QUARTER }).map((n) => n / QUARTER);

const radiusArb = dyadic(8, 16);
const rectArb = fc.record({
  x: dyadic(-500, 500),
  y: dyadic(-500, 500),
  width: dyadic(0, 200), // includes zero-width
  height: dyadic(0, 200), // includes zero-height
});

// Brute-force reference: axis gaps from the centre to the closed rect, then Math.hypot.
function referenceDistance(cx, cy, rect) {
  const gx = Math.max(rect.x - cx, 0, cx - (rect.x + rect.width));
  const gy = Math.max(rect.y - cy, 0, cy - (rect.y + rect.height));
  return { gx, gy, d: Math.hypot(gx, gy) };
}

describe("Property 31: Circle-vs-rect collision matches the geometric definition", () => {
  it("agrees with the Math.hypot brute-force reference (strict <)", () => {
    fc.assert(
      fc.property(
        rectArb,
        radiusArb,
        // Centre offsets relative to the rect origin, spanning inside, near, and far.
        dyadic(-60, 260),
        dyadic(-60, 260),
        (rect, r, ox, oy) => {
          const cx = rect.x + ox;
          const cy = rect.y + oy;
          const { gx, gy, d } = referenceDistance(cx, cy, rect);
          // Math.hypot is not guaranteed correctly rounded; within a hair of r, decide with
          // exact dyadic squares instead (non-equal dyadic distances differ by far more).
          const expected = Math.abs(d - r) > 1e-9 ? d < r : gx * gx + gy * gy < r * r;
          expect(circleIntersectsRect({ cx, cy, r }, rect)).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("returns false when the centre sits exactly r beside an edge", () => {
    fc.assert(
      fc.property(
        rectArb,
        radiusArb,
        fc.constantFrom("left", "right", "top", "bottom"),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (rect, r, edge, f) => {
          // Position along the edge snapped to a dyadic value within [0, length].
          const along = (len) => Math.round(f * len * QUARTER) / QUARTER;
          let cx;
          let cy;
          if (edge === "left" || edge === "right") {
            cx = edge === "left" ? rect.x - r : rect.x + rect.width + r;
            cy = rect.y + along(rect.height);
          } else {
            cx = rect.x + along(rect.width);
            cy = edge === "top" ? rect.y - r : rect.y + rect.height + r;
          }
          expect(circleIntersectsRect({ cx, cy, r }, rect)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});
