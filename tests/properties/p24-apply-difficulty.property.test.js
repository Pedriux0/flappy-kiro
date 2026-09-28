// Feature: flappy-kiro, Property 24: For any Playing world, applyDifficulty sets pipeSpeed to targetPipeSpeed(score, cfg), and applying it again for the same score leaves pipeSpeed unchanged (idempotent). After the update, scrolling uses that single pipeSpeed for every active Pipe_Pair, so all pairs share one common speed.
// **Validates: Requirements 15.5**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyDifficulty, targetPipeSpeed } from "../../src/core/difficulty.js";
import { scrollPipes } from "../../src/core/pipes.js";
import { validConfigArb } from "../arbitraries/config.js";

const finite = (min, max) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const pipesArb = fc.array(
  fc.record({
    x: finite(-200, 1000),
    width: fc.integer({ min: 40, max: 80 }),
    gapY: finite(0, 400),
    gapHeight: fc.integer({ min: 120, max: 200 }),
    scored: fc.boolean(),
  }),
  { maxLength: 8 },
).map((ps) => ps.map((p, i) => ({ id: i, ...p })));

// A Playing world with an arbitrary (possibly stale) pipeSpeed / speedTier.
const worldArb = fc.record({
  state: fc.constant("Playing"),
  score: fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 100_000 })),
  pipeSpeed: finite(0, 1000),
  speedTier: fc.integer({ min: 0, max: 100 }),
  pipes: pipesArb,
  highScore: fc.nat(),
});

const dtArb = fc.oneof(fc.constant(0), fc.constant(1 / 30), finite(0, 1 / 30));

describe("Property 24: Applying difficulty is idempotent and yields one shared speed", () => {
  it("sets pipeSpeed to targetPipeSpeed, is idempotent, and scrolls every pair by pipeSpeed·dt", () => {
    fc.assert(
      fc.property(worldArb, validConfigArb, dtArb, (world, cfg, dt) => {
        const snapshot = structuredClone(world);
        const once = applyDifficulty(world, cfg);
        const twice = applyDifficulty(once, cfg);

        // Speed is derived from the score alone.
        expect(once.pipeSpeed).toBe(targetPipeSpeed(world.score, cfg));
        // Idempotent: same score -> same speed and tier, whole world equal.
        expect(twice).toEqual(once);
        // Pure: input untouched; non-difficulty fields preserved.
        expect(world).toEqual(snapshot);
        expect(once.score).toBe(world.score);
        expect(once.pipes).toEqual(world.pipes);

        // One shared speed: every pair moves by exactly pipeSpeed·dt.
        const dx = once.pipeSpeed * dt;
        const scrolled = scrollPipes(once.pipes, dt, once.pipeSpeed);
        expect(scrolled).toHaveLength(once.pipes.length);
        scrolled.forEach((p, i) => {
          expect(p.x).toBe(once.pipes[i].x - dx);
          expect(p.id).toBe(once.pipes[i].id);
        });
      }),
      { numRuns: 200 },
    );
  });
});
