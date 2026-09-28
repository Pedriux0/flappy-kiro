import { describe, it, expect, vi } from 'vitest';
import { computeDt, createGameLoop } from '../../src/shell/gameLoop.js';
import { MAX_DT, createPlayArea } from '../../src/shell/constants.js';
import { DEFAULT_CONFIG } from '../../src/core/config.js';
import { createInitialWorld } from '../../src/core/world.js';
import { createRng } from '../../src/core/rng.js';
import { initialAnimState, stepAnimation, frameVisual } from '../../src/core/animation.js';

function fakeRaf() {
  const queue = [];
  let nextId = 1;
  const raf = vi.fn((cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  });
  const caf = vi.fn((id) => {
    const i = queue.findIndex((q) => q.id === id);
    if (i >= 0) queue.splice(i, 1);
  });
  const flush = (now) => {
    const pending = queue.splice(0);
    pending.forEach((q) => q.cb(now));
  };
  return { raf, caf, flush, queue };
}

function setup(overrides = {}) {
  const world = createInitialWorld(DEFAULT_CONFIG, createPlayArea(), 0, createRng(1));
  let frame = {};
  const input = { drainInputBuffer: vi.fn(() => { const f = frame; frame = {}; return f; }) };
  const deps = {
    initialWorld: world,
    initialConfig: DEFAULT_CONFIG,
    input,
    renderer: { draw: vi.fn() },
    audio: { apply: vi.fn() },
    store: { apply: vi.fn() },
    log: vi.fn(),
    ...overrides,
  };
  const loop = createGameLoop(deps);
  return { loop, deps, world, press: (f) => { frame = f; } };
}

describe('computeDt', () => {
  it('is 0 on the first frame and for negative/non-finite deltas', () => {
    expect(computeDt(1000, undefined)).toBe(0);
    expect(computeDt(1000, 2000)).toBe(0);
    expect(computeDt(NaN, 0)).toBe(0);
    expect(computeDt(Infinity, 0)).toBe(0);
  });
  it('returns seconds and clamps to MAX_DT', () => {
    expect(computeDt(1010, 1000)).toBeCloseTo(0.01);
    expect(computeDt(5000, 1000)).toBe(MAX_DT);
  });
});

describe('createGameLoop', () => {
  it('importing and creating does not touch requestAnimationFrame', () => {
    expect(() => setup()).not.toThrow();
  });

  it('start/stop schedule and cancel via raf/caf', () => {
    const r = fakeRaf();
    const { loop, deps } = setup({ raf: r.raf, caf: r.caf });
    loop.start();
    loop.start(); // idempotent
    expect(r.raf).toHaveBeenCalledTimes(1);
    r.flush(0);
    r.flush(16);
    expect(deps.renderer.draw).toHaveBeenCalledTimes(2);
    loop.stop();
    expect(r.caf).toHaveBeenCalledTimes(1);
    r.flush(32);
    expect(deps.renderer.draw).toHaveBeenCalledTimes(2);
  });

  it('routes effects to audio and store and draws the updated world', () => {
    const { loop, deps, press } = setup();
    press({ pointer: true });
    loop.tick(0);
    expect(loop.getWorld().state).toBe('Playing');
    const effects = deps.audio.apply.mock.calls[0][0];
    expect(effects.length).toBeGreaterThan(0);
    expect(deps.store.apply).toHaveBeenCalledWith(effects);
    expect(deps.renderer.draw.mock.calls[0][0]).toBe(loop.getWorld());
  });

  it('renderer receives frameVisual of the stepped anim with reducedMotion passed through', () => {
    const { loop, deps, world, press } = setup({ getReducedMotion: () => true });
    press({ pointer: true });
    loop.tick(0);
    loop.tick(20);
    // Recompute expectation with the same pure functions.
    const r1 = deps.audio.apply.mock.calls[0][0];
    const w1 = deps.renderer.draw.mock.calls[0][0];
    let anim = stepAnimation(initialAnimState(), r1, 0, w1, DEFAULT_CONFIG, true);
    const r2 = deps.audio.apply.mock.calls[1][0];
    const w2 = deps.renderer.draw.mock.calls[1][0];
    anim = stepAnimation(anim, r2, 20, w2, DEFAULT_CONFIG, true);
    expect(deps.renderer.draw.mock.calls[1][1]).toEqual(frameVisual(anim, true));
    expect(world.state).toBe('Main_Menu'); // initial world never mutated
  });

  it('setConfig takes effect on the next tick without resetting world', () => {
    const { loop, press } = setup();
    press({ pointer: true });
    loop.tick(0);
    loop.tick(16);
    const before = loop.getWorld();
    const next = { ...DEFAULT_CONFIG, physics: { ...DEFAULT_CONFIG.physics, gravity: 0 } };
    loop.setConfig(next);
    expect(loop.getConfig()).toBe(next);
    expect(loop.getWorld()).toBe(before);
    loop.tick(32);
    const after = loop.getWorld();
    expect(after.state).toBe('Playing');
    // With zero gravity, vertical velocity is unchanged across the step.
    expect(after.ghost.vy).toBeCloseTo(before.ghost.vy);
  });

  it('via the raf path, a large real-time gap steps the world by exactly MAX_DT', () => {
    const r = fakeRaf();
    const { loop, press } = setup({ raf: r.raf, caf: r.caf });
    press({ pointer: true });
    loop.start();
    r.flush(0); // first frame: dt = 0, enters Playing
    const before = loop.getWorld();
    expect(before.state).toBe('Playing');
    r.flush(1000); // 1 s gap must be clamped
    const after = loop.getWorld();
    expect(after.state).toBe('Playing');
    const { gravity, terminalVelocity } = DEFAULT_CONFIG.physics;
    const expectedVy = Math.min(before.ghost.vy + gravity * MAX_DT, terminalVelocity);
    expect(after.ghost.vy).toBeCloseTo(expectedVy);
    loop.stop();
  });

  it('setConfig does not reset the animation state', () => {
    const { loop, deps, press } = setup();
    press({ pointer: true });
    loop.tick(0); // FlapApplied → Flap frame 0 (squash)
    loop.tick(40); // 40 ms → still frame 0; // gaps stay below MAX_DT so no clamping
    loop.tick(80); // 80 ms total → Flap frame 1 (stretch), 20 ms elapsed
    expect(deps.renderer.draw.mock.calls[2][1].scaleX).toBeCloseTo(0.9);
    loop.setConfig({ ...DEFAULT_CONFIG, physics: { ...DEFAULT_CONFIG.physics, gravity: 800 } });
    loop.tick(100); // still Flap frame 1 (40 ms elapsed); a reset would show Idle
    expect(deps.renderer.draw.mock.calls[3][1].scaleX).toBeCloseTo(0.9);
    expect(deps.renderer.draw.mock.calls[3][1].scaleY).toBeCloseTo(1.1);
  });

  it('a throwing sink does not stop the loop and is logged once', () => {
    const { loop, deps } = setup({ audio: { apply: vi.fn(() => { throw new Error('boom'); }) } });
    loop.tick(0);
    loop.tick(16);
    expect(deps.store.apply).toHaveBeenCalledTimes(2);
    expect(deps.renderer.draw).toHaveBeenCalledTimes(2);
    expect(deps.log).toHaveBeenCalledTimes(1);
  });
});
