// AudioManager (design: "AudioManager"). Plays the jump and game-over sounds in
// response to core PlaySound effects. All failures are swallowed so audio can
// never interrupt gameplay or rendering (R13.4).

import { ASSET_PATHS } from './constants.js';

/** Maps PlaySound.sound values to ASSET_PATHS keys. */
const SOUND_KEYS = Object.freeze({ jump: 'jump', gameOver: 'gameOver' });

const noop = () => {};

/**
 * Create one preloaded audio element, or null if construction fails (R13.4).
 * @param {(src: string) => HTMLAudioElement} createAudio
 * @param {string | undefined} src
 */
function preload(createAudio, src) {
  if (typeof src !== 'string') return null;
  try {
    const audio = createAudio(src);
    if (!audio) return null;
    // A load failure just means no sound; keep the element so play() can be
    // attempted (and fail quietly) without special casing.
    if (typeof audio.addEventListener === 'function') {
      audio.addEventListener('error', noop);
    } else {
      audio.onerror = noop;
    }
    try { audio.preload = 'auto'; } catch { /* ignore */ }
    return audio;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   createAudio?: (src: string) => HTMLAudioElement,
 *   paths?: { jump?: string, gameOver?: string },
 * }} [options]
 * @returns {{
 *   apply(effects: Array<{ type: string, sound?: string }>): void,
 *   setMuted(muted: boolean): void,
 *   isMuted(): boolean,
 * }}
 */
export function createAudioManager({
  createAudio = (src) => new Audio(src),
  paths = ASSET_PATHS,
} = {}) {
  const sounds = {};
  for (const [sound, key] of Object.entries(SOUND_KEYS)) {
    sounds[sound] = preload(createAudio, paths?.[key]);
  }
  let muted = false;

  /** Restart a sound from the beginning (R13.3), ignoring any failure (R13.4). */
  function play(audio) {
    try {
      audio.currentTime = 0;
    } catch { /* not seekable yet; still try to play */ }
    try {
      const result = audio.play();
      if (result && typeof result.catch === 'function') result.catch(noop);
    } catch { /* ignore */ }
  }

  return {
    apply(effects) {
      if (muted || !Array.isArray(effects)) return; // R13.5
      for (const effect of effects) {
        if (!effect || effect.type !== 'PlaySound') continue;
        const audio = Object.hasOwn(sounds, effect.sound) ? sounds[effect.sound] : null;
        if (audio) play(audio);
      }
    },
    setMuted(next) {
      muted = Boolean(next);
    },
    isMuted() {
      return muted;
    },
  };
}
