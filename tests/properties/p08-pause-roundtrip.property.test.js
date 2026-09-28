// Feature: flappy-kiro, Property 8: For any Playing world W, toggling pause (→ Paused) and then toggling again (→ Playing) yields a world equal to W in Ghost position/velocity, Pipe_Pairs, clouds, and score.
// **Validates: Requirements 5.1, 5.4**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb } from "../arbitraries/world.js";

/** Any InputFrame with togglePause forced on (other flags arbitrary; pause wins, R5.1). */
const toggleFrameArb = inputFrameArb.map((f) => ({ ...f, togglePause: true }));

/** Any InputFrame with togglePause off (a no-op while Paused, R5.2–5.3). */
const idleFrameArb = inputFrameArb.map((f) => ({ ...f, togglePause: false }));

describe("Pause/resume round-trip", () => {
  it("Property 8: pausing then resuming a Playing world preserves ghost, pipes, clouds, and score", () => {
    fc.assert(
      fc.property(
        worldArb("Playing"),
        toggleFrameArb,
        dtArb,
        fc.array(fc.tuple(idleFrameArb, dtArb), { maxLength: 5 }),
        toggleFrameArb,
        dtArb,
        ({ world: W, config }, pauseInput, pauseDt, idleFrames, resumeInput, resumeDt) => {
          const paused = stepWorld(W, pauseInput, pauseDt, config).world;
          expect(paused.state).toBe("Paused");

          // Frames while Paused without togglePause change nothing.
          let p = paused;
          for (const [input, dt] of idleFrames) {
            p = stepWorld(p, input, dt, config).world;
            expect(p.state).toBe("Paused");
          }

          const resumed = stepWorld(p, resumeInput, resumeDt, config).world;
          expect(resumed.state).toBe("Playing");

          expect(resumed.ghost).toEqual(W.ghost);
          expect(resumed.pipes).toEqual(W.pipes);
          expect(resumed.clouds).toEqual(W.clouds);
          expect(resumed.score).toBe(W.score);
          // The whole world round-trips (pause changes nothing but state).
          expect(resumed).toEqual(W);
        },
      ),
      { numRuns: 200 },
    );
  });
});
