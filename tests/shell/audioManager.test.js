import { describe, it, expect } from 'vitest';
import { createAudioManager } from '../../src/shell/audioManager.js';
import { ASSET_PATHS } from '../../src/shell/constants.js';

/** Minimal HTMLAudioElement stand-in that records calls. */
function makeFactory({ playImpl } = {}) {
  const created = [];
  const createAudio = (src) => {
    const audio = {
      src,
      currentTime: 0,
      plays: 0,
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      play() {
        this.plays += 1;
        return playImpl ? playImpl() : Promise.resolve();
      },
    };
    created.push(audio);
    return audio;
  };
  const bySrc = (src) => created.find((a) => a.src === src);
  return { createAudio, created, bySrc };
}

const jump = { type: 'PlaySound', sound: 'jump' };
const gameOver = { type: 'PlaySound', sound: 'gameOver' };

describe('createAudioManager', () => {
  it('preloads jump and game-over sounds from ASSET_PATHS with error handlers', () => {
    const f = makeFactory();
    createAudioManager({ createAudio: f.createAudio });
    expect(f.created.map((a) => a.src).sort()).toEqual([ASSET_PATHS.gameOver, ASSET_PATHS.jump].sort());
    for (const a of f.created) expect(typeof a.listeners.error).toBe('function');
  });

  it('plays the matching sound for each PlaySound effect and ignores other effects', () => {
    const f = makeFactory();
    const audio = createAudioManager({ createAudio: f.createAudio });
    audio.apply([jump, { type: 'StateEntered', state: 'Game_Over' }, gameOver, { type: 'PersistHighScore', value: 3 }]);
    expect(f.bySrc(ASSET_PATHS.jump).plays).toBe(1);
    expect(f.bySrc(ASSET_PATHS.gameOver).plays).toBe(1);
  });

  it('restarts a sound from the beginning on replay (R13.3)', () => {
    const f = makeFactory();
    const audio = createAudioManager({ createAudio: f.createAudio });
    const el = f.bySrc(ASSET_PATHS.jump);
    audio.apply([jump]);
    el.currentTime = 0.4; // still playing
    audio.apply([jump]);
    expect(el.currentTime).toBe(0);
    expect(el.plays).toBe(2);
  });

  it('suppresses playback while muted and resumes when unmuted (R13.5)', () => {
    const f = makeFactory();
    const audio = createAudioManager({ createAudio: f.createAudio });
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.apply([jump, gameOver, jump]);
    expect(f.created.every((a) => a.plays === 0)).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);
    audio.apply([jump]);
    expect(f.bySrc(ASSET_PATHS.jump).plays).toBe(1);
  });

  it('swallows rejected play() promises and synchronous play() errors (R13.4)', async () => {
    const rejecting = makeFactory({ playImpl: () => Promise.reject(new Error('NotAllowedError')) });
    const a = createAudioManager({ createAudio: rejecting.createAudio });
    expect(() => a.apply([jump, gameOver])).not.toThrow();
    // Let the rejection settle; an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 0));

    const throwing = makeFactory({ playImpl: () => { throw new Error('boom'); } });
    const b = createAudioManager({ createAudio: throwing.createAudio });
    expect(() => b.apply([jump])).not.toThrow();
  });

  it('disables sound when the constructor throws (R13.4)', () => {
    let audio;
    expect(() => {
      audio = createAudioManager({ createAudio: () => { throw new Error('no Audio'); } });
    }).not.toThrow();
    expect(() => audio.apply([jump, gameOver])).not.toThrow();
  });

  it('keeps working after an asset load error fires (R13.4)', () => {
    const f = makeFactory();
    const audio = createAudioManager({ createAudio: f.createAudio });
    for (const a of f.created) expect(() => a.listeners.error(new Event('error'))).not.toThrow();
    expect(() => audio.apply([jump, gameOver])).not.toThrow();
    expect(f.bySrc(ASSET_PATHS.jump).plays).toBe(1);
  });

  it('ignores unknown sound names and non-array input', () => {
    const f = makeFactory();
    const audio = createAudioManager({ createAudio: f.createAudio });
    expect(() => audio.apply([{ type: 'PlaySound', sound: 'toString' }, null])).not.toThrow();
    expect(() => audio.apply(undefined)).not.toThrow();
    expect(f.created.every((a) => a.plays === 0)).toBe(true);
  });

  it('honours custom paths', () => {
    const f = makeFactory();
    createAudioManager({ createAudio: f.createAudio, paths: { jump: 'j.wav', gameOver: 'g.wav' } });
    expect(f.created.map((a) => a.src).sort()).toEqual(['g.wav', 'j.wav']);
  });
});
