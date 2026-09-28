// Feature: flappy-kiro, Property 7: For any Paused world and any Delta_Time, stepping the world leaves the Ghost position and velocity, all Pipe_Pairs, all clouds, and the score identical.
// **Validates: Requirements 5.2, 5.3**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { worldArb, dtArb, inputFrameArb } from "../arbitraries/world.js";

/** The simulation-relevant parts of a World, deep-copied. */
const simSnapshot = (w) =>
  structuredClone({
    ghost: w.ghost,
    pipes: w.pipes,
    clouds: w.clouds,
    score: w.score,
    passed: w.passed,
    nextPipeId: w.nextPipeId,
    pipeSpeed: w.pipeSpeed,
    speedTier: w.speedTier,
  });

describe("Pause is a no-op on the simulation", () => {
  it("Property 7: stepping a Paused world with any dt and any input leaves Ghost, pipes, clouds, and score identical", () => {
    fc.assert(
      fc.property(
        worldArb("Paused"),
        fc.array(fc.tuple(dtArb, inputFrameArb), { minLength: 1, maxLength: 20 }),
        ({ world, config }, frames) => {
          const before = simSnapshot(world);

          let w = world;
          for (const [dt, input] of frames) {
            const { world: next, effects } = stepWorld(w, input, dt, config);

            // Simulation state is frozen whether or not the frame resumes (R5.2, R5.3).
            expect(simSnapshot(next)).toEqual(before);

            if (w.state === "Paused" && !input.togglePause) {
              // Flap and all other inputs are ignored; nothing is emitted (R5.3).
              expect(next).toBe(w);
              expect(effects).toEqual([]);
            }
            if (w.state === "Paused" && input.togglePause) {
              // Only togglePause resumes; the simulation is not advanced in that frame.
              expect(next.state).toBe("Playing");
              expect(effects).toEqual([{ type: "StateEntered", state: "Playing" }]);
            }
            // Stop once resumed: Playing frames legitimately advance the simulation.
            if (next.state !== "Paused") break;
            w = next;
          }

          // The input world is never mutated.
          expect(simSnapshot(world)).toEqual(before);
          expect(world.state).toBe("Paused");
        },
      ),
      { numRuns: 200 },
    );
  });
});
