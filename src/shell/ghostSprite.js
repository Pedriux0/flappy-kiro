/**
 * Ghost sprite preparation and loading (shell, touches the DOM).
 *
 * - prepareGhostSprite: scale the source image once into a size×size
 *   offscreen canvas (R19.2, R19.3), or draw a white fallback ghost (R19.9).
 * - loadGhostSprite: load ghosty.png and resolve to the prepared sprite, or to
 *   the fallback on error / timeout. Never rejects (R19.9).
 *
 * Fallback design decision: the fallback is a single filled white shape
 * (rounded head, straight sides, wavy three-scallop bottom) with NO eyes.
 * R19.9 asks for a "filled white" shape, and the renderer already draws its
 * own cross-eye overlay on Death, so baked-in eyes would clash with it.
 */

import { fitRect } from '../core/sprite.js';
import { SPRITE_LOAD_TIMEOUT_MS } from './constants.js';

/**
 * Default offscreen canvas factory: OffscreenCanvas if available, else a
 * detached <canvas> element.
 * @param {number} w
 * @param {number} h
 */
export function defaultCreateCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Source dimensions, preferring naturalWidth/naturalHeight when present. */
function sourceSize(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  return { w, h };
}

/**
 * Draw the fallback ghost: filled white, entirely inside the size×size cell.
 * Geometry is expressed in a 32-unit design space and scaled to `size`.
 */
function drawFallbackGhost(ctx, size) {
  const k = size / 32;
  const left = 5 * k;
  const right = 27 * k;
  const cx = 16 * k;
  const headCy = 14 * k;
  const headR = 11 * k; // head spans y 3..14, x 5..27
  const sideBottom = 25 * k;
  const scallopDepth = 4 * k; // lowest point y = 29
  const bumps = 3;
  const bumpW = (right - left) / bumps;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(left, headCy);
  ctx.arc(cx, headCy, headR, Math.PI, 0, false); // rounded head, left → right
  ctx.lineTo(right, sideBottom);
  for (let i = 0; i < bumps; i++) {
    const x0 = right - i * bumpW;
    const x1 = x0 - bumpW;
    ctx.quadraticCurveTo((x0 + x1) / 2, sideBottom + scallopDepth, x1, sideBottom);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Prepare the Ghost sprite once (R19.3).
 *
 * @param {CanvasImageSource & { width: number, height: number } | null} image
 *   Loaded source image, or null to draw the fallback shape.
 * @param {{ size?: number, createCanvas?: (w: number, h: number) => any }} [opts]
 * @returns {any} a size×size canvas holding the sprite
 * @throws if `image` has non-positive or non-finite dimensions
 */
export function prepareGhostSprite(image, { size = 32, createCanvas = defaultCreateCanvas } = {}) {
  let rect = null;
  if (image !== null) {
    const { w, h } = sourceSize(image);
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) {
      throw new Error(`prepareGhostSprite: invalid image size ${w}×${h}`);
    }
    rect = fitRect(w, h, size);
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('prepareGhostSprite: 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (rect) {
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  } else {
    drawFallbackGhost(ctx, size);
  }
  return canvas;
}

/**
 * Load the Ghost image and prepare it. Resolves to the prepared sprite on
 * `load`, or to the fallback on `error`, on timeout, or if preparation throws.
 * A `load` arriving after the timeout is ignored. Never rejects; if even the
 * fallback cannot be drawn (no 2D context), resolves to null.
 *
 * @param {{
 *   src: string,
 *   timeoutMs?: number,
 *   size?: number,
 *   createImage?: () => any,
 *   createCanvas?: (w: number, h: number) => any,
 *   setTimer?: (fn: () => void, ms: number) => any,
 * }} opts
 * @returns {Promise<any>}
 */
export function loadGhostSprite({
  src,
  timeoutMs = SPRITE_LOAD_TIMEOUT_MS,
  size = 32,
  createImage = () => new Image(),
  createCanvas = defaultCreateCanvas,
  setTimer = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  return new Promise((resolve) => {
    let settled = false;

    const fallback = () => {
      try {
        return prepareGhostSprite(null, { size, createCanvas });
      } catch (err) {
        console.error('Ghost fallback sprite could not be drawn:', err);
        return null;
      }
    };

    const finish = (image) => {
      if (settled) return; // ignore late load/error after timeout
      settled = true;
      if (image === null) {
        resolve(fallback());
        return;
      }
      try {
        resolve(prepareGhostSprite(image, { size, createCanvas }));
      } catch (err) {
        console.warn('Ghost sprite preparation failed, using fallback:', err);
        resolve(fallback());
      }
    };

    let img;
    try {
      img = createImage();
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      setTimer(() => finish(null), timeoutMs);
      img.src = src;
    } catch (err) {
      console.warn('Ghost image could not be requested, using fallback:', err);
      finish(null);
    }
  });
}
