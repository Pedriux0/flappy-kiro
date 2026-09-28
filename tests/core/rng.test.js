import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng } from "../../src/core/rng.js";

function draw(rng, n) {
  const values = [];
  let r = rng;
  for (let i = 0; i < n; i++) {
    const out = r.next();
    values.push(out.value);
    r = out.rng;
  }
  return values;
}

describe("createRng", () => {
  it("returns values in [0, 1) and a new RNG", () => {
    const rng = createRng(42);
    const { value, rng: nextRng } = rng.next();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(nextRng).not.toBe(rng);
  });

  it("is immutable: calling next() twice on the same RNG gives the same value", () => {
    const rng = createRng(7);
    expect(rng.next().value).toBe(rng.next().value);
    expect(Object.isFrozen(rng)).toBe(true);
  });

  it("is deterministic for equal seeds and independent across instances", () => {
    const a = createRng(123);
    const b = createRng(123);
    draw(a, 10); // advancing one sequence must not affect another
    expect(draw(b, 5)).toEqual(draw(createRng(123), 5));
  });

  it("produces different sequences for different seeds", () => {
    expect(draw(createRng(1), 5)).not.toEqual(draw(createRng(2), 5));
  });

  it("handles non-finite seeds", () => {
    const v = createRng(NaN).next().value;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("property: every drawn value is in [0, 1) and replays identically", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 50 }), (seed, n) => {
        const first = draw(createRng(seed), n);
        const second = draw(createRng(seed), n);
        expect(first).toEqual(second);
        for (const v of first) {
          expect(v >= 0 && v < 1).toBe(true);
        }
      }),
    );
  });
});
