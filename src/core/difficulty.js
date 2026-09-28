// Difficulty progression (pure core, no imports).
// Pipe speed is a deterministic function of the current score and the
// difficulty parameters in the config argument (R15.1–15.5). Gap height is
// never touched here, so progression does not shrink the Gap (R15.7).

/**
 * Raw number of score thresholds crossed: floor(score / speedUpInterval).
 * @param {number} score
 * @param {object} cfg
 * @returns {number}
 */
function thresholdsCrossed(score, cfg) {
  return Math.floor(score / cfg.speedUpInterval);
}

/**
 * Smallest tier at which the speed reaches the cap. Tiers beyond this add no
 * further Speed_Step increase (R15.4).
 * @param {object} cfg
 * @returns {number}
 */
function maxTier(cfg) {
  const headroom = cfg.maxPipeSpeed - cfg.basePipeSpeed;
  if (cfg.speedStep <= 0 || headroom <= 0) return 0;
  return Math.ceil(headroom / cfg.speedStep);
}

/**
 * Target Pipe_Speed for a score:
 * min(basePipeSpeed + floor(score / speedUpInterval) * speedStep, maxPipeSpeed).
 * @param {number} score
 * @param {object} cfg GameConfig
 * @returns {number}
 */
export function targetPipeSpeed(score, cfg) {
  const speed = cfg.basePipeSpeed + thresholdsCrossed(score, cfg) * cfg.speedStep;
  return Math.min(speed, cfg.maxPipeSpeed);
}

/**
 * Return a new World whose pipeSpeed and speedTier are derived from world.score.
 * speedTier = min(floor(score / speedUpInterval), maxTier). Idempotent; never
 * mutates the input world.
 * @param {object} world
 * @param {object} cfg GameConfig
 * @returns {object}
 */
export function applyDifficulty(world, cfg) {
  return {
    ...world,
    pipeSpeed: targetPipeSpeed(world.score, cfg),
    speedTier: Math.min(thresholdsCrossed(world.score, cfg), maxTier(cfg)),
  };
}
