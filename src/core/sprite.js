/**
 * Sprite fitting helpers (pure, no DOM).
 *
 * Requirement 19.2: the source image is scaled uniformly so it fits inside a
 * square cell, filling the longer side, and centred on the shorter side.
 */

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * Fit a `srcW × srcH` image inside a `cell × cell` square, preserving aspect ratio.
 *
 * For ghosty.png (1290×1567) and cell = 32 this yields about 26.3×32,
 * centred horizontally.
 *
 * @param {number} srcW - source width (> 0)
 * @param {number} srcH - source height (> 0)
 * @param {number} cell - cell side length (> 0)
 * @returns {Rect}
 */
export function fitRect(srcW, srcH, cell) {
  const s = Math.min(cell / srcW, cell / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (cell - w) / 2, y: (cell - h) / 2, width: w, height: h };
}
