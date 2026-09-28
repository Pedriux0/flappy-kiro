import { describe, it, expect, vi } from 'vitest';
import { parseHighScore, createHighScoreStore, MAX_HIGH_SCORE } from '../../src/shell/highScoreStore.js';
import { STORAGE_KEY } from '../../src/shell/constants.js';
import fc from 'fast-check';
import { stepWorld } from '../../src/core/step.js';
import { collidingWorldArb, NO_INPUT } from '../arbitraries/world.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

describe('parseHighScore', () => {
  it('accepts valid non-negative integers in range', () => {
    expect(parseHighScore('0')).toBe(0);
    expect(parseHighScore('42')).toBe(42);
    expect(parseHighScore(' 7 ')).toBe(7);
    expect(parseHighScore(String(MAX_HIGH_SCORE))).toBe(MAX_HIGH_SCORE);
    expect(parseHighScore(12)).toBe(12);
  });

  it.each([null, undefined, '', '   ', 'abc', '-1', '1.5', '1e3', '0x10', 'NaN', 'Infinity',
    String(MAX_HIGH_SCORE + 1), -3, 2.5, NaN, {}, true])('returns 0 for %p', (raw) => {
    expect(parseHighScore(raw)).toBe(0);
  });
});

describe('createHighScoreStore', () => {
  it('loads 0 from empty storage and the stored value otherwise', () => {
    expect(createHighScoreStore(memoryStorage()).load()).toBe(0);
    expect(createHighScoreStore(memoryStorage({ [STORAGE_KEY]: '15' })).load()).toBe(15);
  });

  it('load never throws when getItem throws or storage is null', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
    expect(createHighScoreStore(throwing).load()).toBe(0);
    expect(createHighScoreStore(null).load()).toBe(0);
  });

  it('default storage is resolved safely without localStorage', () => {
    const store = createHighScoreStore();
    expect(() => store.load()).not.toThrow();
    expect(() => store.apply([{ type: 'PersistHighScore', value: 3 }])).not.toThrow();
  });

  it('apply writes PersistHighScore values as integers and ignores other effects', () => {
    const storage = memoryStorage();
    const store = createHighScoreStore(storage);
    store.apply([{ type: 'PlaySound', sound: 'gameOver' }, { type: 'PersistHighScore', value: 23 }]);
    expect(storage.data[STORAGE_KEY]).toBe('23');
    expect(store.load()).toBe(23);
  });

  it('apply swallows setItem errors and the in-memory high score is retained', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    const world = { highScore: 50 };
    expect(() => createHighScoreStore(failing).apply([{ type: 'PersistHighScore', value: 50 }])).not.toThrow();
    expect(world.highScore).toBe(50);
    warn.mockRestore();
  });

  it('a new best from a colliding Playing world stays in the world when setItem throws (R9.3, R9.4)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi.fn(() => { throw new Error('QuotaExceeded'); });
    const store = createHighScoreStore({ getItem: () => null, setItem });
    // Colliding Playing worlds with at least one passed pair, and a stale lower high score.
    const arb = collidingWorldArb('Playing')
      .filter(({ world }) => world.score >= 1)
      .map(({ world, config }) => ({ world: { ...world, highScore: world.score - 1 }, config }));
    fc.assert(
      fc.property(arb, ({ world, config }) => {
        const { world: next, effects } = stepWorld(world, NO_INPUT, 0, config);
        expect(next.state).toBe('Game_Over');
        const persist = effects.find((e) => e.type === 'PersistHighScore');
        expect(persist).toBeDefined();
        expect(() => store.apply(effects)).not.toThrow();
        expect(next.highScore).toBe(persist.value);
        expect(next.highScore).toBe(next.score);
        expect(next.highScore).toBeGreaterThan(world.highScore);
      }),
      { numRuns: 50 },
    );
    expect(setItem).toHaveBeenCalled();
    warn.mockRestore();
  });
});
