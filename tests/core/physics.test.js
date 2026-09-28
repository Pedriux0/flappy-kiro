import { describe, it, expect } from 'vitest';
import { applyFlap, integrate } from '../../src/core/physics.js';

const cfg = { gravity: 1600, flapVelocity: -450, terminalVelocity: 700 };
const ghost = () => ({ x: 100, y: 200, vy: 0, width: 32, height: 32 });

describe('applyFlap', () => {
  it('replaces vy with flapVelocity and does not mutate input', () => {
    const g = { ...ghost(), vy: -300 };
    const out = applyFlap(g, cfg.flapVelocity);
    expect(out.vy).toBe(-450);
    expect(out).not.toBe(g);
    expect(g.vy).toBe(-300);
    expect(applyFlap(out, cfg.flapVelocity).vy).toBe(-450); // no accumulation
  });
});

describe('integrate', () => {
  it('applies gravity then position, leaving x unchanged', () => {
    const g = ghost();
    const out = integrate(g, 0.1, cfg);
    expect(out.vy).toBeCloseTo(160);
    expect(out.y).toBeCloseTo(216);
    expect(out.x).toBe(100);
    expect(g).toEqual(ghost());
  });

  it('caps downward velocity at terminalVelocity', () => {
    const out = integrate({ ...ghost(), vy: 690 }, 0.1, cfg);
    expect(out.vy).toBe(700);
    expect(out.y).toBeCloseTo(270);
  });
});
