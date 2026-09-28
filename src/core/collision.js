// Circular-Hitbox collision (pure core, no mutation).
//
// The Ghost collides as a circle of radius `config.ghostHitboxRadius` centred
// on (ghost.x, ghost.y). It never depends on sprite size, animation, or canvas
// scaling (R19.4). All tests are strict: exact contact is not a hit (R19.7).
// `Ghost.width`/`height` are the sprite cell size for rendering only.
/**
 * @typedef {{ cx: number, cy: number, r: number }} Circle
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {import('./pipes.js').PipePair} PipePair
 * @typedef {import('./pipes.js').PlayArea} PlayArea
 */

/**
 * @param {{ x: number, y: number }} ghost
 * @param {{ ghostHitboxRadius: number }} config
 * @returns {Circle}
 */
export function ghostHitbox(ghost, config) {
  return { cx: ghost.x, cy: ghost.y, r: config.ghostHitboxRadius };
}

/**
 * Top pipe spans ceilingY..gapY; bottom pipe spans gapY + gapHeight..groundY.
 * @param {PipePair} pipe
 * @param {PlayArea} playArea
 * @returns {[Rect, Rect]}
 */
export function pipeRects(pipe, playArea) {
  const bottomY = pipe.gapY + pipe.gapHeight;
  return [
    { x: pipe.x, y: playArea.ceilingY, width: pipe.width, height: pipe.gapY - playArea.ceilingY },
    { x: pipe.x, y: bottomY, width: pipe.width, height: playArea.groundY - bottomY },
  ];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Clamp the centre to the rect and compare squared distances (R19.5, R19.7).
 * @param {Circle} circle
 * @param {Rect} rect
 * @returns {boolean}
 */
export function circleIntersectsRect(circle, rect) {
  const px = clamp(circle.cx, rect.x, rect.x + rect.width);
  const py = clamp(circle.cy, rect.y, rect.y + rect.height);
  const dx = circle.cx - px;
  const dy = circle.cy - py;
  return dx * dx + dy * dy < circle.r * circle.r; // equality = touching = no hit
}

/** @param {Circle} circle @param {PlayArea} playArea */
export function hitsGround(circle, playArea) {
  return circle.cy + circle.r > playArea.groundY;
}

/** @param {Circle} circle @param {PlayArea} playArea */
export function hitsCeiling(circle, playArea) {
  return circle.cy - circle.r < playArea.ceilingY;
}

/**
 * True if the Hitbox hits any pipe rect, the Ground, or the Ceiling (R8.1–8.3).
 * @param {{ x: number, y: number }} ghost
 * @param {PipePair[]} pipes
 * @param {PlayArea} playArea
 * @param {{ ghostHitboxRadius: number }} config
 * @returns {boolean}
 */
export function checkCollisions(ghost, pipes, playArea, config) {
  const circle = ghostHitbox(ghost, config);
  if (hitsGround(circle, playArea) || hitsCeiling(circle, playArea)) return true;
  for (const pipe of pipes) {
    const [top, bottom] = pipeRects(pipe, playArea);
    if (circleIntersectsRect(circle, top) || circleIntersectsRect(circle, bottom)) return true;
  }
  return false;
}
