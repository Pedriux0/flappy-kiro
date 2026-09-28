// Flappy Kiro bootstrap (design: "Bootstrap"; R1.1, R1.6, R13.5, R16.1, R16.3,
// R17.8, R19.9, R19.10, R20.10).
//
// Wires the shell modules together and starts the game loop. `boot()` takes
// injectable dependencies so it can be smoke-tested under jsdom; in the
// browser the module boots itself on load.
import { DEFAULT_CONFIG, CONFIG_SCHEMA } from './core/config.js';
import { createRng } from './core/rng.js';
import { createInitialWorld } from './core/world.js';
import {
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  ASSET_PATHS,
  UI_BUTTONS,
  createPlayArea,
} from './shell/constants.js';
import { runStartupValidation } from './shell/startup.js';
import { createHighScoreStore } from './shell/highScoreStore.js';
import { loadGhostSprite } from './shell/ghostSprite.js';
import { createAudioManager } from './shell/audioManager.js';
import { createReducedMotion } from './shell/reducedMotion.js';
import { createInputController } from './shell/inputController.js';
import { createRenderer } from './shell/renderer.js';
import { createGameLoop } from './shell/gameLoop.js';
import { createTuningPanel } from './shell/tuningPanel.js';

/** 32-bit seed from crypto when available, else Date.now(). */
function makeSeed() {
  try {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  } catch {
    return Date.now() >>> 0;
  }
}

/**
 * Boot the game.
 * @param {object} [deps]
 * @param {Document} [deps.doc=document]
 * @param {EventTarget} [deps.keyTarget=window]
 * @param {object} [deps.config=DEFAULT_CONFIG]
 * @param {Storage | null} [deps.storage] passed to createHighScoreStore (undefined → localStorage)
 * @param {number} [deps.seed]
 * @param {(opts: object) => Promise<any>} [deps.loadSprite=loadGhostSprite]
 * @param {(src: string) => any} [deps.createAudio]
 * @param {(query: string) => MediaQueryList} [deps.matchMedia]
 * @param {(cb: (now: number) => void) => any} [deps.raf]
 * @param {(id: any) => void} [deps.caf]
 * @param {boolean} [deps.autoStart=true]
 * @param {string} [deps.search=location.search] `?debug=1` enables the Tuning_Panel (R17.1)
 * @returns {Promise<null | { canvas, ctx, loop, input, renderer, audio, store, reducedMotion, panel }>}
 *   `panel` is null unless debug mode is enabled.
 *   null when the canvas or its 2D context is unavailable.
 */
export async function boot({
  doc = globalThis.document,
  keyTarget = globalThis.window,
  config = DEFAULT_CONFIG,
  storage,
  seed = makeSeed(),
  loadSprite = loadGhostSprite,
  createAudio,
  matchMedia = globalThis.matchMedia,
  raf,
  caf,
  autoStart = true,
  search = globalThis.location?.search ?? '',
} = {}) {
  // Canvas + 2D context; one error and stop if either is missing.
  const canvas = doc?.getElementById?.('game') ?? null;
  let ctx = null;
  try {
    ctx = canvas?.getContext?.('2d') ?? null;
  } catch {
    ctx = null;
  }
  if (!canvas || !ctx) {
    console.error('Flappy Kiro: canvas #game or its 2D context is unavailable; the game cannot start.');
    return null;
  }
  // Backing store at the logical resolution; CSS handles display scaling.
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;

  // Startup config validation: warnings logged, radius corrected (R16.1, R16.3, R19.10).
  const { config: startConfig } = runStartupValidation(config, CONFIG_SCHEMA);

  const store = createHighScoreStore(storage);
  const highScore = store.load(); // R1.6
  const rng = createRng(seed);
  const initialWorld = createInitialWorld(startConfig, createPlayArea(), highScore, rng);

  // Never rejects; resolves to the fallback on error or 5 s timeout (R19.9).
  let ghostSprite = null;
  try {
    ghostSprite = await loadSprite({ src: ASSET_PATHS.ghost });
  } catch {
    ghostSprite = null;
  }

  const audio = createAudioManager(createAudio ? { createAudio } : {});
  const reducedMotion = createReducedMotion(matchMedia); // R20.10

  // Display scale: CSS px per logical px.
  const getDisplayScale = () => {
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? rect.width / LOGICAL_WIDTH : 1;
  };
  const toLogical = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : LOGICAL_WIDTH;
    const h = rect.height > 0 ? rect.height : LOGICAL_HEIGHT;
    return {
      x: ((clientX - rect.left) / w) * LOGICAL_WIDTH,
      y: ((clientY - rect.top) / h) * LOGICAL_HEIGHT,
    };
  };

  // The loop is created after input/renderer, and the panel after the loop,
  // so input/renderer read them late-bound.
  let loop = null;
  let panel = null;

  const input = createInputController({
    target: canvas,
    keyTarget,
    toLogical,
    getWorld: () => loop?.getWorld() ?? initialWorld,
    getDisplayScale,
    buttons: UI_BUTTONS,
    // Events from the Tuning_Panel never flap (R17.9).
    isPanelTarget: (t) => panel?.contains(t) ?? false,
    onToggleMute: () => audio.setMuted(!audio.isMuted()), // R13.5
  });

  const renderer = createRenderer(ctx, {
    ghostSprite,
    getConfig: () => loop?.getConfig() ?? startConfig,
    buttons: UI_BUTTONS,
    getDisplayScale,
  });

  loop = createGameLoop({
    initialWorld,
    initialConfig: startConfig,
    input,
    renderer,
    audio,
    store,
    getReducedMotion: () => reducedMotion.get(),
    ...(raf ? { raf } : {}),
    ...(caf ? { caf } : {}),
  });

  // Developer Tuning_Panel: only with ?debug=1, else null (R17.1, R17.2).
  // Edits go through loop.setConfig and apply next frame without a reset
  // (R17.5, R17.10); nothing is persisted (R17.8).
  panel = createTuningPanel({
    search,
    schema: CONFIG_SCHEMA,
    getConfig: () => loop.getConfig(),
    setConfig: (next) => loop.setConfig(next),
    parent: doc.getElementById('game-container') ?? canvas.parentElement,
    keyTarget,
  });

  if (autoStart) loop.start(); // R1.1: first frame shows Main_Menu

  return { canvas, ctx, loop, input, renderer, audio, store, reducedMotion, panel };
}

// Auto-boot in the browser; tests set __FLAPPY_KIRO_NO_AUTOBOOT__ and call boot() directly.
if (typeof document !== 'undefined' && !globalThis.__FLAPPY_KIRO_NO_AUTOBOOT__) {
  boot().catch((err) => console.error('Flappy Kiro failed to start:', err));
}
