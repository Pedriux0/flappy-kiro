// Feature: flappy-kiro, Property 9: For any set of Pipe_Pairs, any current shared pipeSpeed, and any Delta_Time, after scrolling every pair's x decreases by exactly pipeSpeed · dt, identically for every pair — so all pairs always move at one common speed even as that speed changes over the run.
// **Validates: Requirements 6.1, 15.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scrollPipes } from "../../src/core/pipes.js";
import { validConfigArb } from "../arbitraries/config.js";

const finite = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const pipeArb = fc.record({
  id: fc.nat(),
  x: finite(-200, 2000),
  width: finite(40, 120),
  gapY: finite(0, 600),
  gapHeight: finite(100, 250),
  scored: fc.boolean(),
});
const pipesArb = fc.array(pipeArb, { maxLength: 8 });
const dtArb = finite(0, 0.1);

// A current shared speed inside [basePipeSpeed, maxPipeSpeed] of a valid config.
const speedArb = validConfigArb.chain((config) =>
  finite(config.basePipeSpeed, config.maxPipeSpeed),
);

/** Assert one scroll step moved every pair by exactly speed·dt and nothing else. */
function checkStep(before, after, dt, speed) {
  expect(after).toHaveLength(before.length);
  const dx = speed * dt;
  after.forEach((pipe, i) => {
    expect(pipe.x).toBe(before[i].x - dx);
    expect(pipe).toEqual({ ...before[i], x: before[i].x - dx });
  });
}

describe("Pipe scrolling", () => {
  it("Property 9: every pair moves left by exactly speed·dt, without mutating input", () => {
    fc.assert(
      fc.property(pipesArb, dtArb, speedArb, (pipes, dt, speed) => {
        const snapshot = pipes.map((p) => ({ ...p }));
        const out = scrollPipes(pipes, dt, speed);
        checkStep(snapshot, out, dt, speed);
        expect(pipes).toEqual(snapshot);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 9: pairs share one common speed as that speed changes across frames", () => {
    const framesArb = fc.array(fc.tuple(dtArb, speedArb), { minLength: 1, maxLength: 20 });
    fc.assert(
      fc.property(pipesArb, framesArb, (pipes, frames) => {
        let current = pipes;
        for (const [dt, speed] of frames) {
          const next = scrollPipes(current, dt, speed);
          checkStep(current, next, dt, speed);
          current = next;
        }
      }),
      { numRuns: 150 },
    );
  });
});
