// Feature: flappy-kiro, Property 10: For any deterministic RNG seed and any config inside the schema ranges, each spawned Pipe_Pair has gapHeight equal to config.gapHeight at spawn time, has its Gap fully inside the play area (gapY ≥ ceiling and gapY + gapHeight ≤ groundY), and consecutive spawned pairs are separated by config.spawnDistance. Changing config.gapHeight leaves the gapHeight of already-spawned pairs unchanged.
// **Validates: Requirements 6.2, 6.4**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { maybeSpawnPipe, scrollPipes } from "../../src/core/pipes.js";
import { createRng } from "../../src/core/rng.js";
import { CONFIG_SCHEMA } from "../../src/core/config.js";
import { validConfigArb } from "../arbitraries/config.js";

const gapEntry = CONFIG_SCHEMA.find((e) => e.key === "gapHeight");

// Play area tall enough that the largest valid gapHeight (300) always fits.
const playAreaArb = fc.integer({ min: 560, max: 620 }).map((groundY) => ({
  width: 480,
  height: 640,
  groundY,
  ceilingY: 0,
}));

describe("Property 10: New pipes spawn at fixed spacing with an in-bounds Gap", () => {
  it("spawns in-bounds pairs spacing spawnDistance apart; gapHeight changes only affect new pairs", () => {
    fc.assert(
      fc.property(
        validConfigArb,
        fc.integer(), // RNG seed
        playAreaArb,
        fc.array(fc.double({ min: 1, max: 40, noNaN: true }), { minLength: 10, maxLength: 80 }), // scroll per step
        fc.nat(), // step index seed for the mid-run gapHeight change
        fc.integer({ min: gapEntry.min, max: gapEntry.max }), // new gapHeight
        (baseConfig, seed, playArea, steps, changeSeed, newGapHeight) => {
          let config = { ...baseConfig };
          const world = { playArea };
          const { ceilingY, groundY, width: spawnEdge } = playArea;
          const changeAt = changeSeed % steps.length;

          let pipes = [];
          let rng = createRng(seed);
          let lastSpawned = null;

          steps.forEach((dx, i) => {
            if (i === changeAt) config = { ...config, gapHeight: newGapHeight };

            const before = pipes;
            const rightmostX = before.length ? Math.max(...before.map((p) => p.x)) : null;
            const shouldSpawn =
              before.length === 0 || spawnEdge - rightmostX >= config.spawnDistance;

            const result = maybeSpawnPipe(before, world, config, rng);
            pipes = result.pipes;
            rng = result.rng;

            // Existing pairs are never touched (incl. their gapHeight after a config change).
            expect(pipes.slice(0, before.length)).toEqual(before);

            if (!shouldSpawn) {
              expect(pipes.length).toBe(before.length);
            } else {
              expect(pipes.length).toBe(before.length + 1);
              const spawned = pipes[pipes.length - 1];

              // Gap size captured from config at spawn time (R6.4).
              expect(spawned.gapHeight).toBe(config.gapHeight);
              // Gap fully inside the play area (R6.4).
              expect(spawned.gapY).toBeGreaterThanOrEqual(ceilingY);
              expect(spawned.gapY + spawned.gapHeight).toBeLessThanOrEqual(groundY);
              // Fixed spacing from the previous rightmost pair, or at the spawn edge (R6.2).
              if (rightmostX === null) {
                expect(spawned.x).toBe(spawnEdge);
              } else {
                expect(spawned.x).toBe(rightmostX + config.spawnDistance);
                // The previous rightmost pair is the previously spawned one.
                expect(rightmostX).toBe(lastSpawned.x);
              }
              lastSpawned = spawned;
            }

            // Advance the world; lastSpawned tracks its scrolled position.
            pipes = scrollPipes(pipes, 1, dx);
            if (lastSpawned) lastSpawned = pipes.find((p) => p.id === lastSpawned.id);
          });

          // Every pair keeps the gapHeight that was current when it spawned.
          const gapHeights = pipes.map((p) => p.gapHeight);
          for (const h of gapHeights) {
            expect([baseConfig.gapHeight, newGapHeight]).toContain(h);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
