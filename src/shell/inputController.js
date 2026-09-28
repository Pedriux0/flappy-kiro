// InputController (design: Shell > InputController).
// Buffers raw mouse/touch/keyboard events and drains them once per frame into a
// single InputFrame, so repeated events within a frame collapse to one (R3.6).
// The controller only reports what happened; stepWorld decides what it means.

import { UI_BUTTONS, displayRect } from './constants.js';

/** @returns {import('../core/step.js').InputFrame} an InputFrame with every flag false */
function emptyFrame() {
  return {
    flap: false,
    pointer: false,
    startKey: false,
    playPressed: false,
    highScoresPressed: false,
    backPressed: false,
    toggleBestScore: false,
    escape: false,
    togglePause: false,
    restart: false,
  };
}

/** Pointer button id → InputFrame flag (R5.4, R10.2, R18.2, R18.4, R18.7). */
const BUTTON_FLAGS = Object.freeze({
  PLAY: 'playPressed',
  HIGH_SCORES: 'highScoresPressed',
  BACK: 'backPressed',
  RESTART: 'restart',
  PAUSE: 'togglePause',
  RESUME: 'togglePause',
});

/**
 * Return the id of the first button visible in `world` whose display rect
 * (grown for display scale `s`, R18.8) contains logical point `p`, or null.
 * Edges are inclusive.
 * @param {{ x: number, y: number }} p logical canvas coordinates
 * @param {object[] | Record<string, object>} buttons array or map of UiButtons
 * @param {object} world current World (used by each button's visibleIn)
 * @param {number} [s=1] display scale (CSS px per logical px)
 * @returns {string | null}
 */
export function hitTest(p, buttons, world, s = 1) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !buttons) return null;
  const list = Array.isArray(buttons) ? buttons : Object.values(buttons);
  for (const button of list) {
    if (!button || typeof button.visibleIn !== 'function' || !button.visibleIn(world)) continue;
    const r = displayRect(button, s);
    if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) {
      return button.id;
    }
  }
  return null;
}

/** Normalise a KeyboardEvent to one of our actions, or null. Case-insensitive for letters. */
function keyAction(event) {
  const key = typeof event.key === 'string' ? event.key : '';
  const code = typeof event.code === 'string' ? event.code : '';
  if (key === ' ' || key === 'Spacebar' || code === 'Space') return 'space';
  if (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter') return 'enter';
  if (key === 'Escape' || key === 'Esc' || code === 'Escape') return 'escape';
  const lower = key.length === 1 ? key.toLowerCase() : '';
  if (lower === 'p' || code === 'KeyP') return 'p';
  if (lower === 'h' || code === 'KeyH') return 'h';
  if (lower === 'm' || code === 'KeyM') return 'm';
  return null;
}

/**
 * Create the input controller and attach listeners.
 * @param {object} opts
 * @param {EventTarget} opts.target receives mousedown/touchstart (usually the canvas)
 * @param {EventTarget} [opts.keyTarget=target] receives keydown (usually window)
 * @param {(clientX: number, clientY: number) => { x: number, y: number }} [opts.toLogical]
 *   converts client coordinates to logical canvas coordinates (default: identity)
 * @param {() => object} [opts.getWorld] returns the current World for button visibility
 * @param {() => number} [opts.getDisplayScale] returns the display scale s (default 1)
 * @param {object[] | Record<string, object>} [opts.buttons=UI_BUTTONS]
 * @param {(t: EventTarget | null) => boolean} [opts.isPanelTarget] true → event ignored (R17.9)
 * @param {() => void} [opts.onToggleMute] called on a non-repeat M press (R13.5)
 * @returns {{ drainInputBuffer: () => object, dispose: () => void }}
 */
export function createInputController({
  target,
  keyTarget = target,
  toLogical = (x, y) => ({ x, y }),
  getWorld = () => null,
  getDisplayScale = () => 1,
  buttons = UI_BUTTONS,
  isPanelTarget = () => false,
  onToggleMute = () => {},
} = {}) {
  let buffer = emptyFrame();

  const ignored = (event) => {
    try {
      return Boolean(isPanelTarget(event.target));
    } catch {
      return false;
    }
  };

  function handlePointer(clientX, clientY) {
    const p = toLogical(clientX, clientY);
    const id = hitTest(p, buttons, getWorld(), getDisplayScale());
    const flag = id ? BUTTON_FLAGS[id] : null;
    if (flag) {
      buffer[flag] = true;
    } else {
      // Generic click/tap (R3.2, R3.3); stepWorld decides whether it flaps or starts.
      buffer.pointer = true;
      buffer.flap = true;
    }
  }

  function onMouseDown(event) {
    if (ignored(event)) return;
    handlePointer(event.clientX, event.clientY);
  }

  function onTouchStart(event) {
    if (ignored(event)) return;
    // Suppress emulated mouse events and scrolling/zoom on the canvas.
    if (event.cancelable !== false) event.preventDefault();
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    if (!touch) return;
    handlePointer(touch.clientX, touch.clientY);
  }

  function onKeyDown(event) {
    if (ignored(event)) return;
    const action = keyAction(event);
    if (!action) return;
    // Space must never scroll the page, even on auto-repeat.
    if (action === 'space') event.preventDefault();
    if (event.repeat === true) return; // R18.10
    switch (action) {
      case 'space':
        buffer.startKey = true;
        buffer.flap = true;
        break;
      case 'enter':
        buffer.startKey = true; // never flap (R2.1, R10.2)
        break;
      case 'p':
        buffer.togglePause = true;
        break;
      case 'h':
        buffer.toggleBestScore = true;
        break;
      case 'escape':
        buffer.escape = true;
        break;
      case 'm':
        onToggleMute();
        break;
      default:
        break;
    }
  }

  target?.addEventListener('mousedown', onMouseDown);
  target?.addEventListener('touchstart', onTouchStart, { passive: false });
  keyTarget?.addEventListener('keydown', onKeyDown);

  /** Return the buffered InputFrame and reset the buffer (R3.6). */
  function drainInputBuffer() {
    const frame = buffer;
    buffer = emptyFrame();
    return frame;
  }

  function dispose() {
    target?.removeEventListener('mousedown', onMouseDown);
    target?.removeEventListener('touchstart', onTouchStart, { passive: false });
    keyTarget?.removeEventListener('keydown', onKeyDown);
  }

  return { drainInputBuffer, dispose };
}
