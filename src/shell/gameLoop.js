// Game loop (design: "The game loop"; R3.1–3.3, R12.5, R13.1, R13.2, R17.5,
// R17.10, R20.2, R20.9, R20.10).
// Owns the mutable session state: `world`, `currentConfig`, and `anim`. Each
// tick: drain input → stepWorld → stepAnimation → draw → audio/store effects.
// No DOM access at import time, so this module is importable from node tests.

import { stepWorld } from '../core/step.js';
import { initialAnimState, stepAnimation, frameVisual } from '../core/animation.js';
import { MAX_DT } from './constants.js';

/**
 * Clamped frame delta in seconds (R12.5).
 * Returns 0 on the first frame (`last` undefined/null) and for negative or
 * non-finite deltas; otherwise `min((now - last) / 1000, MAX_DT)`.
 * @param {number} now current timestamp in ms
 * @param {number | undefined | null} last previous timestamp in ms
 * @returns {number} seconds in [0, MAX_DT]
 */
export function computeDt(now, last) {
  if (last === undefined || last === null) return 0;
  const dt = (now - last) / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, MAX_DT);
}

// Resolve the scheduler lazily so importing in node never touches a missing global.
const defaultRaf = (cb) => globalThis.requestAnimationFrame(cb);
const defaultCaf = (id) => globalThis.cancelAnimationFrame?.(id);

/**
 * @param {object} deps
 * @param {object} deps.initialWorld
 * @param {object} deps.initialConfig GameConfig
 * @param {{ drainInputBuffer(): object }} deps.input
 * @param {{ draw(world: object, visual: object): void }} deps.renderer
 * @param {{ apply(effects: Array<object>): void }} deps.audio
 * @param {{ apply(effects: Array<object>): void }} deps.store
 * @param {() => boolean} [deps.getReducedMotion]
 * @param {(cb: (now: number) => void) => any} [deps.raf]
 * @param {(id: any) => void} [deps.caf]
 * @param {(...args: any[]) => void} [deps.log] error logger (called once per failing sink)
 */
export function createGameLoop({
  initialWorld,
  initialConfig,
  input,
  renderer,
  audio,
  store,
  getReducedMotion = () => false,
  raf = defaultRaf,
  caf = defaultCaf,
  log = (...args) => console.error(...args),
}) {
  let world = initialWorld;
  let currentConfig = initialConfig;
  let anim = initialAnimState();
  let last;
  let running = false;
  let handle = null;
  const logged = new Set();

  // Run a side effect so one failing sink never kills the loop; log once per sink.
  function guard(name, fn) {
    try {
      fn();
    } catch (err) {
      if (!logged.has(name)) {
        logged.add(name);
        log(`[gameLoop] ${name} failed:`, err);
      }
    }
  }

  function readReducedMotion() {
    try {
      return getReducedMotion() === true;
    } catch {
      return false;
    }
  }

  /** Advance one frame at timestamp `now` (ms). Exposed for tests. */
  function tick(now) {
    const dt = computeDt(now, last);
    last = now;

    let frame = {};
    guard('input', () => {
      frame = input.drainInputBuffer() ?? {};
    });

    const result = stepWorld(world, frame, dt, currentConfig);
    world = result.world;
    const effects = result.effects;

    const reducedMotion = readReducedMotion();
    anim = stepAnimation(anim, effects, dt * 1000, world, currentConfig, reducedMotion);

    guard('renderer', () => renderer.draw(world, frameVisual(anim, reducedMotion)));
    guard('audio', () => audio.apply(effects));
    guard('store', () => store.apply(effects));
  }

  function onFrame(now) {
    if (!running) return;
    tick(now);
    if (running) handle = raf(onFrame);
  }

  return {
    getWorld: () => world,
    getConfig: () => currentConfig,
    /** Replace the config used from the next tick on; `world` and `anim` are untouched (R17.5). */
    setConfig(next) {
      currentConfig = next;
    },
    start() {
      if (running) return;
      running = true;
      last = undefined; // first frame after (re)start gets dt = 0
      handle = raf(onFrame);
    },
    stop() {
      if (!running) return;
      running = false;
      if (handle !== null) caf(handle);
      handle = null;
    },
    isRunning: () => running,
    tick,
  };
}
