// Feature: flappy-kiro, Property 30: For any Playing world and any two configs A and B that differ only in physics values, stepWorld(world, input, dt, B) integrates the Ghost with B's gravity, flap velocity, and terminal velocity (matching Property 2 evaluated with B), and leaves state, score, and the set of Pipe_Pair ids unchanged compared with stepWorld(world, input, dt, A) whenever neither step causes a collision.
// **Validates: Requirements 17.5, 17.10**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validConfigArb } from "../arbitraries/config.js";
import { worldForConfigArb, dtArb, NO_INPUT } from "../arbitraries/world.js";
import { stepWorld } from "../../src/core/step.js";
import { applyFlap, integrate } from "../../src/core/physics.js";
import { targetPipeSpeed } from "../../src/core/difficulty.js";

/**
 * B = A with physics and difficulty values taken from a second valid config.
 * Geometry, spawn, and cloud fields stay shared, so a world built for A is valid for B.
 */
function mixConfig(a, other) {
  return {
    ...a,
    physics: { ...other.physics },
    basePipeSpeed: other.basePipeSpeed,
    maxPipeSpeed: other.maxPipeSpeed,
    speedStep: other.speedStep,
    speedUpInterval: other.speedUpInterval,
  };
}

const scenarioArb = fc.tuple(validConfigArb, validConfigArb).chain(([a, other]) => {
  const b = mixConfig(a, other);
  return fc.record({
    a: fc.constant(a),
    b: fc.constant(b),
    scene: worldForConfigArb(a, { state: "Playing", variant: "safe" }),
    dt: dtArb,
    flap: fc.boolean(),
  });
});

const ids = (w) => w.pipes.map((p) => p.id);

describe("Config is read per step", () => {
  it("Property 30: stepWorld uses the config passed in each call without resetting the session", () => {
    fc.assert(
      fc.property(scenarioArb, ({ a, b, scene, dt, flap }) => {
        const world = scene.world;
        const input = { ...NO_INPUT, flap };
        const rA = stepWorld(world, input, dt, a).world;
        const rB = stepWorld(world, input, dt, b).world;

        // Ghost integrated with B's physics (Property 2 evaluated with B).
        const pre = flap ? applyFlap(world.ghost, b.physics.flapVelocity) : world.ghost;
        const expected = integrate(pre, dt, b.physics);
        expect(rB.ghost.vy).toBe(expected.vy);
        expect(rB.ghost.y).toBe(expected.y);
        expect(rB.ghost.x).toBe(world.ghost.x);

        // Difficulty from B for the resulting score.
        expect(rB.pipeSpeed).toBe(targetPipeSpeed(rB.score, b));

        // Session not reset: never back to Main_Menu, score monotone, pipes/score match A.
        expect(["Playing", "Game_Over"]).toContain(rB.state);
        expect(rB.score).toBeGreaterThanOrEqual(world.score);
        for (const id of world.passed) expect(rB.passed.has(id)).toBe(true);
        expect(rB.score).toBe(rA.score);
        expect([...rB.passed].sort()).toEqual([...rA.passed].sort());
        expect(ids(rB)).toEqual(ids(rA));
        expect(rB.nextPipeId).toBe(rA.nextPipeId);

        if (rA.state === "Playing" && rB.state === "Playing") {
          expect(rB.state).toBe(rA.state);
        }
        const expectedHigh = rB.state === "Game_Over" ? Math.max(world.highScore, rB.score) : world.highScore;
        expect(rB.highScore).toBe(expectedHigh);
      }),
      { numRuns: 200 },
    );
  });
});
