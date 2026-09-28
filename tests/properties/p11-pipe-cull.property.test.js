// Feature: flappy-kiro, Property 11: For any set of Pipe_Pairs, culling removes exactly the pairs fully past the left edge (x + width < 0) and retains every other pair unchanged.
// **Validates: Requirements 6.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { cullPipes } from "../../src/core/pipes.js";

const finite = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const pipeWidthArb = fc.oneof(fc.constant(64), fc.integer({ min: 40, max: 120 }), finite(40, 120));

// x biased around the cull boundary (x = -width) so exact-edge and just-past cases appear often.
const pipeArb = pipeWidthArb.chain((width) =>
  fc.record({
    id: fc.nat({ max: 1_000_000 }),
    x: fc.oneof(
      finite(-400, 800),
      fc.constant(-width), // x + width === 0: on the edge, retained
      fc.constant(-width - 0.5), // just past: culled
      fc.constant(-width + 0.5), // just visible: retained
      fc.constant(0),
    ),
    width: fc.constant(width),
    gapY: finite(0, 500),
    gapHeight: finite(120, 220),
    scored: fc.boolean(),
  })
);

describe("Pipe culling", () => {
  it("Property 11: removes exactly pairs with x + width < 0 and keeps the rest unchanged, in order", () => {
    fc.assert(
      fc.property(fc.array(pipeArb, { maxLength: 12 }), (pipes) => {
        const snapshot = structuredClone(pipes);
        const result = cullPipes(pipes);

        // Exactly the expected survivors, in original order, with identical contents.
        const expected = snapshot.filter((p) => p.x + p.width >= 0);
        expect(result).toEqual(expected);

        // No culled pair survives; every survivor is on or right of the left edge.
        for (const p of result) expect(p.x + p.width < 0).toBe(false);

        // Input is not mutated.
        expect(pipes).toEqual(snapshot);
      }),
      { numRuns: 200 }
    );
  });
});
