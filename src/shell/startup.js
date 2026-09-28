// Startup config validation (shell). Runs resolveConfig once at load, logs one
// warning per problem, and hands back the config the game should use.
import { resolveConfig } from "../core/config.js";

/**
 * Validate the config at startup and log each warning (R16.1–16.6, R19.10).
 * Each warning is logged as a single string naming the key, the current value,
 * and the allowed range or relation (all carried by resolveConfig's message).
 * Invalid values other than ghostHitboxRadius are only warned about, never
 * corrected (R16.3); an invalid radius comes back replaced with 12 (R19.10).
 * Never throws, including when `warn` throws.
 * @param {object} config
 * @param {Array<{key: string, min: number, max: number}>} schema
 * @param {(message: string) => void} [warn=console.warn]
 * @returns {{config: object, warnings: Array<{key: string, value: *, message: string}>}}
 */
export function runStartupValidation(config, schema, warn = console.warn) {
  let result;
  try {
    result = resolveConfig(config, schema);
  } catch {
    result = { config, warnings: [] };
  }
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const resolved = result && "config" in result ? result.config : config;

  for (const w of warnings) {
    try {
      warn(`Flappy Kiro config warning: ${w.message}`);
    } catch {
      // A throwing logger must not break startup (R16.3).
    }
  }
  return { config: resolved, warnings };
}
