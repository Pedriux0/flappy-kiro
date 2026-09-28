// Pure Ghost physics. Both functions return a new Ghost and never mutate input.
// Gravity and the terminal-velocity cap are the only forces (R14.4); tuning
// values are always passed in from config, never hard-coded here (R14.6).

/**
 * @typedef {{ x: number, y: number, vy: number, width: number, height: number }} Ghost
 * @typedef {{ gravity: number, flapVelocity: number, terminalVelocity: number }} PhysicsConfig
 */

/**
 * Flap: replace vertical velocity with the flap velocity, so upward momentum
 * never accumulates across rapid flaps (R3.4, R14.2).
 * @param {Ghost} ghost
 * @param {number} flapVelocity
 * @returns {Ghost}
 */
export function applyFlap(ghost, flapVelocity) {
  return { ...ghost, vy: flapVelocity };
}

/**
 * Advance the Ghost by one step of `dt` seconds (R4.1–4.4, R14.1, R14.3–14.5):
 *   vy' = min(vy + gravity·dt, terminalVelocity)
 *   y'  = y + vy'·dt
 * `x` is left unchanged; the world scrolls instead.
 * @param {Ghost} ghost
 * @param {number} dt seconds
 * @param {PhysicsConfig} physicsCfg
 * @returns {Ghost}
 */
export function integrate(ghost, dt, physicsCfg) {
  const vy = Math.min(ghost.vy + physicsCfg.gravity * dt, physicsCfg.terminalVelocity);
  return { ...ghost, vy, y: ghost.y + vy * dt };
}
