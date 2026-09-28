import { describe, it, expect, vi } from 'vitest';
import { createReducedMotion, REDUCED_MOTION_QUERY } from '../../src/shell/reducedMotion.js';

/** Minimal MediaQueryList stub supporting the modern or legacy listener API. */
function stubMql(matches, { legacy = false } = {}) {
  const listeners = new Set();
  const mql = { matches, media: REDUCED_MOTION_QUERY };
  if (legacy) {
    mql.addListener = (fn) => listeners.add(fn);
    mql.removeListener = (fn) => listeners.delete(fn);
  } else {
    mql.addEventListener = (type, fn) => type === 'change' && listeners.add(fn);
    mql.removeEventListener = (type, fn) => type === 'change' && listeners.delete(fn);
  }
  const fire = (value) => {
    mql.matches = value;
    for (const fn of [...listeners]) fn({ matches: value, media: REDUCED_MOTION_QUERY });
  };
  return { mql, fire, listeners };
}

describe('createReducedMotion (R20.10)', () => {
  it('queries prefers-reduced-motion and returns true when it matches', () => {
    const { mql } = stubMql(true);
    const matchMedia = vi.fn(() => mql);
    const rm = createReducedMotion(matchMedia);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(rm.get()).toBe(true);
  });

  it('updates on change events and stops after dispose', () => {
    const { mql, fire, listeners } = stubMql(false);
    const rm = createReducedMotion(() => mql);
    expect(rm.get()).toBe(false);
    fire(true);
    expect(rm.get()).toBe(true);
    rm.dispose();
    expect(listeners.size).toBe(0);
    fire(false);
    expect(rm.get()).toBe(true);
    expect(() => rm.dispose()).not.toThrow();
  });

  it('falls back to legacy addListener/removeListener', () => {
    const { mql, fire, listeners } = stubMql(false, { legacy: true });
    const rm = createReducedMotion(() => mql);
    fire(true);
    expect(rm.get()).toBe(true);
    rm.dispose();
    expect(listeners.size).toBe(0);
  });

  it('returns false when matchMedia is missing', () => {
    expect(createReducedMotion(undefined).get()).toBe(false);
    expect(createReducedMotion(null).get()).toBe(false);
    // Node has no globalThis.matchMedia, so the default also degrades to false.
    expect(createReducedMotion().get()).toBe(false);
  });

  it('calls matchMedia with this = globalThis (no Illegal invocation)', () => {
    const { mql } = stubMql(true);
    const matchMedia = function (q) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return mql;
    };
    expect(createReducedMotion(matchMedia).get()).toBe(true);
  });

  it('never throws when matchMedia or the MediaQueryList misbehaves', () => {
    const throwing = () => { throw new Error('boom'); };
    expect(createReducedMotion(throwing).get()).toBe(false);
    expect(createReducedMotion(() => null).get()).toBe(false);
    const bad = { matches: true, addEventListener: throwing, removeEventListener: throwing };
    const rm = createReducedMotion(() => bad);
    expect(rm.get()).toBe(true);
    expect(() => rm.dispose()).not.toThrow();
  });
});
