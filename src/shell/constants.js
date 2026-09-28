// Shell-level structural constants (design: "Shell constants").
// These are not gameplay tuning values (those live in src/core/config.js).
// No DOM access here, so this module is importable from node tests.

/** localStorage key for the persisted High_Score (R1.6, R9.3). */
export const STORAGE_KEY = 'flappy-kiro.highScore';

/** Asset paths relative to the page root (R12.1, R13.1, R13.2). */
export const ASSET_PATHS = Object.freeze({
  ghost: 'assets/ghosty.png',
  jump: 'assets/jump.wav',
  gameOver: 'assets/game_over.wav',
});

/** Delta-time clamp in seconds (R8, R12.5). */
export const MAX_DT = 1 / 30;

/** Fixed logical resolution, portrait (ui-mockups.md §1). */
export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 640;

/** Height of the persistent bottom score bar strip; the Ground sits on top of it. */
export const SCORE_BAR_HEIGHT = 40;

/** After this many ms without a sprite load, the fallback Ghost shape is used (R19.9). */
export const SPRITE_LOAD_TIMEOUT_MS = 5000;

/** Minimum displayed touch-target side in CSS px (R18.8). */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Build the PlayArea derived from the logical resolution.
 * Ground is the top edge of the score bar; Ceiling is the top of the canvas.
 * @returns {{ width: number, height: number, groundY: number, ceilingY: number }}
 */
export function createPlayArea() {
  return {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    groundY: LOGICAL_HEIGHT - SCORE_BAR_HEIGHT,
    ceilingY: 0,
  };
}

const inMenu = (world) => world.state === 'Main_Menu' && !world.menu?.bestScoreOpen;
const inPanel = (world) => world.state === 'Main_Menu' && Boolean(world.menu?.bestScoreOpen);

/**
 * On-screen buttons in logical px, shared by InputController and Renderer
 * (R5.1, R5.4, R10.2, R18.1, R18.8). Layout follows ui-mockups.md.
 * PLAY/HIGH_SCORES centres are 96 px apart so their grown rects at scale 0.5
 * (88 px tall) still do not overlap.
 * @type {Readonly<Record<'PLAY'|'HIGH_SCORES'|'BACK'|'RESTART'|'RESUME'|'PAUSE', {
 *   id: string, x: number, y: number, width: number, height: number,
 *   label: string, visibleIn: (world: object) => boolean }>>}
 */
export const UI_BUTTONS = Object.freeze({
  // Main menu: centred, below the idling ghost (ghost centre at y = 320).
  PLAY: Object.freeze({
    id: 'PLAY', x: 140, y: 372, width: 200, height: 56, label: 'PLAY', visibleIn: inMenu,
  }),
  HIGH_SCORES: Object.freeze({
    id: 'HIGH_SCORES', x: 140, y: 468, width: 200, height: 56, label: 'HIGH SCORES', visibleIn: inMenu,
  }),
  // Best score panel: centred in the panel.
  BACK: Object.freeze({
    id: 'BACK', x: 180, y: 340, width: 120, height: 52, label: 'BACK', visibleIn: inPanel,
  }),
  // Game over panel: below Score/Best/NEW BEST!.
  RESTART: Object.freeze({
    id: 'RESTART', x: 160, y: 380, width: 160, height: 52, label: 'RESTART',
    visibleIn: (world) => world.state === 'Game_Over',
  }),
  // Paused panel: centred under "Press P to resume".
  RESUME: Object.freeze({
    id: 'RESUME', x: 160, y: 340, width: 160, height: 52, label: 'RESUME',
    visibleIn: (world) => world.state === 'Paused',
  }),
  // Top-right pause control.
  PAUSE: Object.freeze({
    id: 'PAUSE', x: 420, y: 12, width: 48, height: 48, label: 'II',
    visibleIn: (world) => world.state === 'Playing',
  }),
});

/**
 * Grow a button rect about its centre so each side is at least 44 / s logical px,
 * keeping the displayed hit area ≥ 44×44 CSS px at display scale s (R18.8).
 * Never shrinks. Non-positive or non-finite s is treated as 1.
 * @param {{ x: number, y: number, width: number, height: number }} button
 * @param {number} s display scale (CSS px per logical px)
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function displayRect(button, s) {
  const scale = Number.isFinite(s) && s > 0 ? s : 1;
  const min = MIN_TOUCH_TARGET_PX / scale;
  const width = Math.max(button.width, min);
  const height = Math.max(button.height, min);
  const cx = button.x + button.width / 2;
  const cy = button.y + button.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
