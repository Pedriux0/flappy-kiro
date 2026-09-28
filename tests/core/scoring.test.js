import { describe, it, expect } from "vitest";
import { updateScore } from "../../src/core/scoring.js";

const pipe = (id, x, scored = false) => ({ id, x, width: 60, gapY: 200, gapHeight: 150, scored });
const world = (ghostX, pipes, score = 0) => ({ ghost: { x: ghostX }, pipes, score });

describe("updateScore", () => {
  it("scores a pair once the Ghost passes its trailing edge", () => {
    const prev = world(100, [pipe(1, 45)], 2);
    const next = world(100, [pipe(1, 39)], 2);
    const r = updateScore(prev, next);
    expect(r.score).toBe(3);
    expect([...r.passed]).toEqual([1]);
  });

  it("does not score when the Ghost is exactly on the trailing edge", () => {
    const r = updateScore(world(100, [pipe(1, 40)], 0), world(100, [pipe(1, 40)], 0));
    expect(r.score).toBe(0);
    expect(r.passed.size).toBe(0);
  });

  it("never re-scores a pair already marked scored", () => {
    const r = updateScore(world(100, [pipe(1, 0, true)], 5), world(100, [pipe(1, -5, true)], 5));
    expect(r.score).toBe(5);
    expect(r.passed.has(1)).toBe(true);
  });

  it("honours an existing passed set and scores multiple new pairs", () => {
    const prev = { ...world(300, [pipe(1, 0), pipe(2, 100), pipe(3, 400)], 1), passed: new Set([1]) };
    const next = world(300, [pipe(1, -5), pipe(2, 95), pipe(3, 395)], 1);
    const r = updateScore(prev, next);
    expect(r.score).toBe(2);
    expect([...r.passed].sort()).toEqual([1, 2]);
  });

  it("does not mutate its inputs", () => {
    const prev = world(100, [pipe(1, 45)], 0);
    const next = world(100, [pipe(1, 39)], 0);
    const snap = JSON.stringify([prev, next]);
    updateScore(prev, next);
    expect(JSON.stringify([prev, next])).toBe(snap);
  });
});
