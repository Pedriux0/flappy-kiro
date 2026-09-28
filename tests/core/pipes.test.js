import { describe, it, expect } from "vitest";
import { scrollPipes, cullPipes, maybeSpawnPipe } from "../../src/core/pipes.js";
import { createRng } from "../../src/core/rng.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const playArea = { width: 480, height: 640, groundY: 580, ceilingY: 0 };
const world = { playArea };
const pipe = (id, x, extra = {}) => ({ id, x, width: 60, gapY: 100, gapHeight: 160, scored: false, ...extra });

describe("scrollPipes", () => {
  it("moves every pair left by speed * dt without mutating input", () => {
    const pipes = [pipe(0, 100), pipe(1, 320)];
    const out = scrollPipes(pipes, 0.5, 160);
    expect(out.map((p) => p.x)).toEqual([20, 240]);
    expect(pipes.map((p) => p.x)).toEqual([100, 320]);
  });
});

describe("cullPipes", () => {
  it("drops only pairs with x + width < 0", () => {
    const pipes = [pipe(0, -61), pipe(1, -60), pipe(2, 10)];
    expect(cullPipes(pipes).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("maybeSpawnPipe", () => {
  it("spawns at the right edge when no pipes exist", () => {
    const rng = createRng(1);
    const out = maybeSpawnPipe([], world, DEFAULT_CONFIG, rng);
    expect(out.pipes).toHaveLength(1);
    const p = out.pipes[0];
    expect(p).toMatchObject({ id: 0, x: 480, width: 60, gapHeight: 160, scored: false });
    expect(p.gapY).toBeGreaterThanOrEqual(0);
    expect(p.gapY + p.gapHeight).toBeLessThanOrEqual(580);
    expect(out.rng).not.toBe(rng);
  });

  it("does not spawn before the rightmost pair is spawnDistance from the edge", () => {
    const pipes = [pipe(0, 300)];
    const rng = createRng(1);
    const out = maybeSpawnPipe(pipes, world, DEFAULT_CONFIG, rng);
    expect(out.pipes).toBe(pipes);
    expect(out.rng).toBe(rng);
  });

  it("spawns exactly spawnDistance right of the rightmost pair with a fresh id", () => {
    const pipes = [pipe(3, 40), pipe(4, 255)];
    const out = maybeSpawnPipe(pipes, world, DEFAULT_CONFIG, createRng(2));
    expect(out.pipes).toHaveLength(3);
    expect(out.pipes[2].x).toBe(255 + 220);
    expect(out.pipes[2].id).toBe(5);
  });

  it("respects world.nextPipeId so ids stay unique after culling", () => {
    const out = maybeSpawnPipe([], { playArea, nextPipeId: 9 }, DEFAULT_CONFIG, createRng(3));
    expect(out.pipes[0].id).toBe(9);
  });

  it("uses the new gapHeight only for new pairs", () => {
    const pipes = [pipe(0, 200, { gapHeight: 160 })];
    const cfg = { ...DEFAULT_CONFIG, gapHeight: 250 };
    const out = maybeSpawnPipe(pipes, world, cfg, createRng(4));
    expect(out.pipes[0].gapHeight).toBe(160);
    expect(out.pipes[1].gapHeight).toBe(250);
    expect(out.pipes[1].gapY + 250).toBeLessThanOrEqual(580);
  });
});
