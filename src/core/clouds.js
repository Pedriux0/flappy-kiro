// Parallax cloud layers (R1.4, R12.3, R12.6, R12.7, R12.8, R15.6).
//
// Each cloud belongs to a depth layer whose horizontal speed is
// `ratio * pipeSpeed`, with the ratio taken from `config.cloudLayerSpeedRatios`
// (each in (0, 1)). Because the speed tracks the current pipe speed, every
// layer stays strictly slower than the pipes even as difficulty ramps up.
//
// All functions are pure: inputs are never mutated and new objects are returned.
//
// Wrapping: `scrollClouds` has no playArea argument, so each cloud carries the
// data it needs to wrap itself:
//   - `width`     the cloud's drawn width in logical px (CLOUD_BASE_WIDTH * scale)
//   - `wrapWidth` the play-area width captured at creation time (the right edge)
// A cloud is off-screen once its right edge (x + width) is left of x = 0; it is
// then moved so it re-enters from just beyond the right edge (x >= wrapWidth - overflow).

/** Base cloud width in logical px at scale 1. */
export const CLOUD_BASE_WIDTH = 64;
/** Scale range for generated clouds. */
export const CLOUD_SCALE_MIN = 0.75;
export const CLOUD_SCALE_MAX = 1.5;
/** Clouds are placed in the upper portion of the play area (fraction of its height). */
export const CLOUD_BAND_FRACTION = 0.6;
/** Fallback wrap width when a cloud carries none (matches LOGICAL_WIDTH). */
export const DEFAULT_WRAP_WIDTH = 480;

/**
 * @typedef {{ x: number, y: number, scale: number, layer: number, opacity: number,
 *             width: number, wrapWidth: number }} Cloud
 * @typedef {{ width: number, height: number, groundY: number, ceilingY: number }} PlayArea
 */

/** Draw a value in [lo, hi) from an immutable RNG. */
function drawRange(rng, lo, hi) {
  const { value, rng: next } = rng.next();
  return { value: lo + value * (hi - lo), rng: next };
}

/**
 * Generate `config.cloudCount` clouds spread round-robin over the layers in
 * `config.cloudLayerSpeedRatios`, with opacity in [cloudOpacityMin, cloudOpacityMax].
 * @param {object} config GameConfig
 * @param {PlayArea} playArea
 * @param {{ next(): { value: number, rng: any } }} rng
 * @returns {{ clouds: Cloud[], rng: any }}
 */
export function createClouds(config, playArea, rng) {
  const count = Math.max(0, Math.floor(config.cloudCount));
  const layerCount = Math.max(1, config.cloudLayerSpeedRatios.length);
  const opLo = Math.min(config.cloudOpacityMin, config.cloudOpacityMax);
  const opHi = Math.max(config.cloudOpacityMin, config.cloudOpacityMax);
  const top = playArea.ceilingY;
  const bandHeight = (playArea.groundY - playArea.ceilingY) * CLOUD_BAND_FRACTION;

  const clouds = [];
  let r = rng;
  for (let i = 0; i < count; i++) {
    const layer = i % layerCount;
    const x = drawRange(r, 0, playArea.width); r = x.rng;
    const y = drawRange(r, top, top + bandHeight); r = y.rng;
    const scale = drawRange(r, CLOUD_SCALE_MIN, CLOUD_SCALE_MAX); r = scale.rng;
    const op = drawRange(r, 0, 1); r = op.rng;
    clouds.push({
      x: x.value,
      y: y.value,
      scale: scale.value,
      layer,
      // Clamp guards against floating-point drift outside [opLo, opHi].
      opacity: Math.min(opHi, Math.max(opLo, opLo + op.value * (opHi - opLo))),
      width: CLOUD_BASE_WIDTH * scale.value,
      wrapWidth: playArea.width,
    });
  }
  return { clouds, rng: r };
}

/**
 * Horizontal speed of each layer: `ratio * pipeSpeed`.
 * @param {number} pipeSpeed
 * @param {number[]} ratios
 * @returns {number[]}
 */
export function layerSpeeds(pipeSpeed, ratios) {
  return ratios.map((ratio) => ratio * pipeSpeed);
}

/**
 * Move each cloud left by its layer speed * dt and wrap it to the right edge
 * once it has fully left the left edge.
 * @param {Cloud[]} clouds
 * @param {number} dt seconds
 * @param {number} pipeSpeed current Pipe_Speed (px/s)
 * @param {number[]} ratios cloudLayerSpeedRatios
 * @returns {Cloud[]}
 */
export function scrollClouds(clouds, dt, pipeSpeed, ratios) {
  const speeds = layerSpeeds(pipeSpeed, ratios);
  return clouds.map((cloud) => {
    const speed = speeds.length > 0 ? speeds[cloud.layer % speeds.length] : 0;
    const width = Number.isFinite(cloud.width) ? cloud.width : CLOUD_BASE_WIDTH * (cloud.scale ?? 1);
    const wrapWidth = Number.isFinite(cloud.wrapWidth) ? cloud.wrapWidth : DEFAULT_WRAP_WIDTH;
    let x = cloud.x - speed * dt;
    const rightEdge = x + width;
    if (rightEdge < 0) {
      // Period covers the visible width plus the cloud's own width, so the
      // overflow past the left edge carries over (continuous even for large dt).
      const period = wrapWidth + width;
      const wrapped = ((rightEdge % period) + period) % period;
      x = wrapped - width;
    }
    return { ...cloud, x };
  });
}
