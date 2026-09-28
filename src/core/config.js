// Centralized gameplay tuning configuration (pure core, no imports).
// Single source of truth for every gameplay tuning value; the core reads these
// from the `config` argument of stepWorld on every frame.

/** Default circular Hitbox radius in logical canvas pixels (R19.4, R19.10). */
export const DEFAULT_HITBOX_RADIUS = 12;

// Physics defaults and the threshold interval equal R14.1–14.3 and R15.2 (R16.7).
export const DEFAULT_CONFIG = {
  physics: {
    gravity: 1600,            // R14.1
    flapVelocity: -450,       // R14.2 (within R3.4's -500..-400)
    terminalVelocity: 700,    // R14.3
  },
  basePipeSpeed: 160,         // R15.1 Base_Pipe_Speed
  maxPipeSpeed: 280,          // R15.3 Max_Pipe_Speed (>= basePipeSpeed, R16.4)
  speedStep: 20,              // R15.2 Speed_Step
  speedUpInterval: 5,         // R15.2
  gapHeight: 160,             // R6.4 fixed Gap vertical size
  spawnDistance: 220,         // R6.2 fixed horizontal spacing
  pipeWidth: 60,              // R12.2 (40..80)
  cloudLayerSpeedRatios: [0.2, 0.4], // R12.7 (>= 2 distinct), R12.8/R15.6 (each in (0, 1))
  cloudCount: 6,              // R12.3 (1..10)
  cloudOpacityMin: 0.3,       // R12.6 (0.3..0.8)
  cloudOpacityMax: 0.8,       // R12.6 (0.3..0.8)
  ghostWidth: 32,             // R12.1, R19.1
  ghostHeight: 32,            // R12.1, R19.1
  ghostHitboxRadius: DEFAULT_HITBOX_RADIUS, // R19.4, R19.10 (12 <= 32 / 2, R19.8)
  ghostStartXRatio: 0.3,      // R1.3 (30% of play area width)
  ghostStartYRatio: 0.5,      // R1.3 (50% of play area height)
  scoreFontSize: 20,          // R12.4 (16..48)
};

// R = bound taken from a requirement; G = developer guard-rail (no requirement bound).
// `panel: true` entries are shown in the Tuning_Panel (R17.4).
export const CONFIG_SCHEMA = [
  { key: "physics.gravity",          label: "Gravity",           min: 400,  max: 4000, step: 10,   panel: true  }, // G
  { key: "physics.flapVelocity",     label: "Flap velocity",     min: -500, max: -400, step: 5,    panel: true  }, // R3.4
  { key: "physics.terminalVelocity", label: "Terminal velocity", min: 200,  max: 1500, step: 10,   panel: true  }, // G
  { key: "basePipeSpeed",            label: "Base pipe speed",   min: 60,   max: 400,  step: 5,    panel: true  }, // G
  { key: "maxPipeSpeed",             label: "Max pipe speed",    min: 60,   max: 600,  step: 5,    panel: true  }, // G
  { key: "speedStep",                label: "Speed step",        min: 0,    max: 100,  step: 1,    panel: true  }, // G
  { key: "speedUpInterval",          label: "Speed-up interval", min: 1,    max: 50,   step: 1,    panel: true  }, // G
  { key: "gapHeight",                label: "Gap height",        min: 100,  max: 300,  step: 5,    panel: true  }, // G
  { key: "spawnDistance",            label: "Spawn distance",    min: 150,  max: 400,  step: 5,    panel: true  }, // G
  { key: "pipeWidth",                label: "Pipe width",        min: 40,   max: 80,   step: 1,    panel: false }, // R12.2
  { key: "ghostWidth",               label: "Ghost width",       min: 24,   max: 48,   step: 1,    panel: false }, // R12.1
  { key: "ghostHeight",              label: "Ghost height",      min: 24,   max: 48,   step: 1,    panel: false }, // R12.1
  { key: "ghostHitboxRadius",        label: "Hitbox radius",     min: 8,    max: 16,   step: 1,    panel: true  }, // R19.8
  { key: "cloudCount",               label: "Cloud count",       min: 1,    max: 10,   step: 1,    panel: false }, // R12.3
  { key: "cloudOpacityMin",          label: "Cloud opacity min", min: 0.3,  max: 0.8,  step: 0.05, panel: false }, // R12.6
  { key: "cloudOpacityMax",          label: "Cloud opacity max", min: 0.3,  max: 0.8,  step: 0.05, panel: false }, // R12.6
  { key: "scoreFontSize",            label: "Score font size",   min: 16,   max: 48,   step: 1,    panel: false }, // R12.4
];
// cloudLayerSpeedRatios is checked by validateConfig directly rather than by a
// schema range, because its bound is exclusive: each ratio must be in (0, 1)
// (R12.8, R15.6, R16.5), and there must be at least 2 distinct ratios (R12.7).
// ghostHitboxRadius also has a cross-field check in validateConfig:
// radius <= min(ghostWidth, ghostHeight) / 2 (R19.8). resolveConfig replaces an
// invalid radius with 12 (R19.10); all other invalid values stay warn-only (R16.3).

/**
 * Read a value from a config by dotted key path (e.g. "physics.gravity").
 * Returns undefined if any segment along the path is missing. Never throws.
 * @param {object} config
 * @param {string} key
 * @returns {*}
 */
export function getConfigValue(config, key) {
  let current = config;
  for (const part of String(key).split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Format any value for a warning message without ever throwing
 * (e.g. Symbols or null-prototype objects break template literals).
 * @param {*} value
 * @returns {string}
 */
function formatValue(value) {
  try {
    if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
      return String(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "symbol" || typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
    return Object.prototype.toString.call(value);
  } catch {
    return "<unprintable>";
  }
}

/**
 * Check a config against the schema and the cross-field rules.
 * Pure and never throws. Returns one ConfigWarning ({ key, value, message })
 * per problem found, or [] when everything is valid (R16.1, R16.2, R16.4,
 * R16.5, R16.6, R12.7, R19.8).
 * @param {object} config
 * @param {Array<{key: string, min: number, max: number}>} schema
 * @returns {Array<{key: string, value: *, message: string}>}
 */
export function validateConfig(config, schema) {
  const warnings = [];
  try {
    const cfg = config !== null && typeof config === "object" ? config : {};
    const entries = Array.isArray(schema) ? schema : [];
    const read = (key) => {
      try {
        return getConfigValue(cfg, key);
      } catch {
        return undefined;
      }
    };

    // Per-entry range / finiteness checks (R16.1, R16.2).
    for (const entry of entries) {
      if (entry === null || typeof entry !== "object") continue;
      const key = String(entry.key);
      const { min, max } = entry;
      const value = read(key);
      const range = `[${formatValue(min)}, ${formatValue(max)}]`;
      if (value === undefined) {
        warnings.push({ key, value, message: `${key} is missing; allowed range ${range}` });
      } else if (typeof value !== "number" || !Number.isFinite(value)) {
        warnings.push({ key, value, message: `${key} is ${formatValue(value)}, not a finite number; allowed range ${range}` });
      } else if (value < min || value > max) {
        warnings.push({ key, value, message: `${key} is ${formatValue(value)}, outside allowed range ${range}` });
      }
    }

    const isNum = (v) => typeof v === "number" && Number.isFinite(v);

    // maxPipeSpeed >= basePipeSpeed (R16.4).
    const base = read("basePipeSpeed");
    const maxSpeed = read("maxPipeSpeed");
    if (isNum(base) && isNum(maxSpeed) && maxSpeed < base) {
      warnings.push({
        key: "maxPipeSpeed/basePipeSpeed",
        value: { maxPipeSpeed: maxSpeed, basePipeSpeed: base },
        message: `maxPipeSpeed (${maxSpeed}) must be >= basePipeSpeed (${base})`,
      });
    }

    // Each cloud layer ratio strictly inside (0, 1) (R16.5), and >= 2 distinct (R12.7).
    const ratios = read("cloudLayerSpeedRatios");
    if (Array.isArray(ratios)) {
      ratios.forEach((ratio, i) => {
        if (!isNum(ratio) || ratio <= 0 || ratio >= 1) {
          warnings.push({
            key: `cloudLayerSpeedRatios[${i}]`,
            value: ratio,
            message: `cloudLayerSpeedRatios[${i}] is ${formatValue(ratio)}; each ratio must be strictly between 0 and 1`,
          });
        }
      });
    }
    const distinct = Array.isArray(ratios) ? new Set(ratios).size : 0;
    if (distinct < 2) {
      warnings.push({
        key: "cloudLayerSpeedRatios",
        value: ratios,
        message: `cloudLayerSpeedRatios has ${distinct} distinct value(s); at least 2 distinct ratios are required`,
      });
    }

    // Hitbox must fit inside the sprite: radius <= min(width, height) / 2 (R19.8).
    const radius = read("ghostHitboxRadius");
    const width = read("ghostWidth");
    const height = read("ghostHeight");
    if (isNum(radius) && isNum(width) && isNum(height)) {
      const limit = Math.min(width, height) / 2;
      if (radius > limit) {
        warnings.push({
          key: "ghostHitboxRadius",
          value: radius,
          message: `ghostHitboxRadius (${radius}) must be <= min(ghostWidth, ghostHeight) / 2 (${limit})`,
        });
      }
    }
  } catch {
    // Never throw (R16.3); return whatever was collected.
  }
  return warnings;
}

/**
 * Clamp a value into the [min, max] range of the schema entry with that key
 * (R17.6). In-range values, and keys without a schema entry, are returned unchanged.
 * @param {string} key
 * @param {number} value
 * @param {Array<{key: string, min: number, max: number}>} schema
 * @returns {number}
 */
export function clampToSchema(key, value, schema) {
  const entry = Array.isArray(schema)
    ? schema.find((e) => e !== null && typeof e === "object" && e.key === key)
    : undefined;
  if (!entry) return value;
  return Math.min(Math.max(value, entry.min), entry.max);
}

/**
 * Validate a config and apply the one correction the game makes at load:
 * a ghostHitboxRadius that is missing, non-numeric, below 8, above 16, or above
 * min(ghostWidth, ghostHeight) / 2 is replaced with DEFAULT_HITBOX_RADIUS (R19.10).
 * Every other field is returned unchanged, including other invalid values,
 * which are only warned about (R16.3). Pure: the input is never mutated.
 * Never throws.
 * @param {object} config
 * @param {Array<{key: string, min: number, max: number}>} schema
 * @returns {{config: object, warnings: Array<{key: string, value: *, message: string}>}}
 */
export function resolveConfig(config, schema) {
  const KEY = "ghostHitboxRadius";
  let warnings = [];
  try {
    warnings = validateConfig(config, schema);
    const isObj = config !== null && typeof config === "object" && !Array.isArray(config);
    const read = (key) => {
      try {
        return isObj ? config[key] : undefined;
      } catch {
        return undefined;
      }
    };
    const isNum = (v) => typeof v === "number" && Number.isFinite(v);

    const radius = read(KEY);
    const width = read("ghostWidth");
    const height = read("ghostHeight");
    let reason = null;
    if (radius === undefined) {
      reason = "is missing";
    } else if (!isNum(radius)) {
      reason = `is ${formatValue(radius)}, not a finite number`;
    } else if (radius < 8 || radius > 16) {
      reason = `is ${radius}, outside allowed range [8, 16]`;
    } else if (isNum(width) && isNum(height) && radius > Math.min(width, height) / 2) {
      reason = `(${radius}) must be <= min(ghostWidth, ghostHeight) / 2 (${Math.min(width, height) / 2})`;
    }

    if (reason === null) {
      return { config, warnings };
    }

    // Replace validateConfig's radius warning(s) with a single one that
    // mentions the replacement, kept at the position of the first one.
    const replacement = {
      key: KEY,
      value: radius,
      message: `${KEY} ${reason}; replaced with ${DEFAULT_HITBOX_RADIUS}`,
    };
    const firstIndex = warnings.findIndex((w) => w && w.key === KEY);
    const others = warnings.filter((w) => !(w && w.key === KEY));
    if (firstIndex === -1) {
      others.push(replacement);
    } else {
      others.splice(firstIndex, 0, replacement);
    }

    const resolved = isObj ? { ...config, [KEY]: DEFAULT_HITBOX_RADIUS } : { [KEY]: DEFAULT_HITBOX_RADIUS };
    return { config: resolved, warnings: others };
  } catch {
    // Never throw (R16.3).
    return { config, warnings };
  }
}

/**
 * Return a new config with the value at a dotted key path replaced
 * (e.g. "physics.gravity"). Every object along the path is shallow-copied, so
 * the input config and its nested objects are never mutated; untouched
 * siblings are shared by reference (R17.5, R17.10). Missing intermediate
 * segments are created as plain objects.
 * @param {object} config
 * @param {string} key
 * @param {*} value
 * @returns {object}
 */
export function setConfigValue(config, key, value) {
  const parts = String(key).split(".");
  const copy = (node) => {
    if (Array.isArray(node)) return node.slice();
    if (node !== null && typeof node === "object") return { ...node };
    return {};
  };
  const root = copy(config);
  let target = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = copy(target[parts[i]]);
    target[parts[i]] = next;
    target = next;
  }
  target[parts[parts.length - 1]] = value;
  return root;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Serialize one value as a JS expression. Numbers keep -0, NaN and ±Infinity
 * (which JSON cannot represent); strings are JSON-quoted.
 * @param {*} value
 * @param {string} indent current indentation
 * @returns {string}
 */
function serializeValue(value, indent) {
  const inner = indent + "  ";
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || value === null) return String(value);
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map((v) => serializeValue(v, inner)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const lines = keys.map((k) => {
      const name = IDENTIFIER.test(k) ? k : JSON.stringify(k);
      return `${inner}${name}: ${serializeValue(value[k], inner)},`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return "undefined";
}

/**
 * Serialize a config as pasteable JS source:
 * `export const DEFAULT_CONFIG = { ... };` (R17.7). Pure.
 * @param {object} config
 * @returns {string}
 */
export function serializeConfig(config) {
  return `export const DEFAULT_CONFIG = ${serializeValue(config, "")};`;
}
