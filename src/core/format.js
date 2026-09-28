// Pure Score_Display formatting (no DOM access).
// Requirements: 1.5, 11.2, 11.3

/**
 * Coerce a value to a non-negative integer for display.
 * Non-finite or negative values become 0; fractions are floored.
 * @param {number} value
 * @returns {number}
 */
function toDisplayInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * Format the Score_Display text, e.g. "Score: 3 | High: 12".
 * @param {number} score current score
 * @param {number} highScore current high score
 * @returns {string}
 */
export function formatScoreDisplay(score, highScore) {
  return `Score: ${toDisplayInt(score)} | High: ${toDisplayInt(highScore)}`;
}
