// Shared fast-check generators for GameConfig values (Properties 26–30, 32).
// validConfigArb  -> a config validateConfig accepts with no warnings.
// invalidConfigArb -> { config, mutatedKeys } where mutatedKeys are the exact
//                     warning keys validateConfig should emit for the mutation.
import fc from "fast-check";
import { DEFAULT_CONFIG, CONFIG_SCHEMA } from "../../src/core/config.js";

const RATIO_MIN = Number.EPSILON;
const RATIO_MAX = 1 - Number.EPSILON;
const PAIR_KEY = "maxPipeSpeed/basePipeSpeed";
const RADIUS_KEY = "ghostHitboxRadius";

/** Deep-clone a plain config (objects and arrays only). */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

/** Set a dotted key on a (cloned) config in place. */
function setPath(config, key, value) {
  const parts = key.split(".");
  let target = config;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts[parts.length - 1]] = value;
}

const schemaEntry = (key) => CONFIG_SCHEMA.find((e) => e.key === key);

/** Arbitrary for a single in-range schema value (integers where step is integral). */
function entryArb({ min, max, step }) {
  return Number.isInteger(step)
    ? fc.integer({ min, max })
    : fc.double({ min, max, noNaN: true });
}

// Entries drawn independently; the cross-field ones are handled explicitly below.
const CROSS_FIELD_KEYS = new Set([
  "basePipeSpeed",
  "maxPipeSpeed",
  "cloudOpacityMin",
  "cloudOpacityMax",
  "ghostWidth",
  "ghostHeight",
  "ghostHitboxRadius",
]);
const independentEntries = CONFIG_SCHEMA.filter((e) => !CROSS_FIELD_KEYS.has(e.key));

const baseEntry = schemaEntry("basePipeSpeed");
const maxEntry = schemaEntry("maxPipeSpeed");

// maxPipeSpeed >= basePipeSpeed (R16.4).
const pipeSpeedsArb = entryArb(baseEntry).chain((basePipeSpeed) =>
  fc
    .integer({ min: Math.max(basePipeSpeed, maxEntry.min), max: maxEntry.max })
    .map((maxPipeSpeed) => ({ basePipeSpeed, maxPipeSpeed })),
);

// cloudOpacityMin <= cloudOpacityMax (R12.6).
const opacityArb = fc
  .tuple(entryArb(schemaEntry("cloudOpacityMin")), entryArb(schemaEntry("cloudOpacityMax")))
  .map(([a, b]) => ({ cloudOpacityMin: Math.min(a, b), cloudOpacityMax: Math.max(a, b) }));

// Radius integer in [8, min(16, floor(min(w, h) / 2))] (R19.8).
const radiusEntry = schemaEntry(RADIUS_KEY);
const ghostArb = fc
  .tuple(entryArb(schemaEntry("ghostWidth")), entryArb(schemaEntry("ghostHeight")))
  .chain(([ghostWidth, ghostHeight]) =>
    fc
      .integer({
        min: radiusEntry.min,
        max: Math.min(radiusEntry.max, Math.floor(Math.min(ghostWidth, ghostHeight) / 2)),
      })
      .map((ghostHitboxRadius) => ({ ghostWidth, ghostHeight, ghostHitboxRadius })),
  );

// At least two distinct ratios strictly inside (0, 1) (R12.7, R16.5).
const ratiosArb = fc.uniqueArray(fc.double({ min: RATIO_MIN, max: RATIO_MAX, noNaN: true }), {
  minLength: 2,
  maxLength: 4,
});

const independentArb = fc.tuple(...independentEntries.map(entryArb));

/** A config that passes validateConfig with zero warnings. Non-schema fields keep defaults. */
export const validConfigArb = fc
  .tuple(independentArb, pipeSpeedsArb, opacityArb, ghostArb, ratiosArb)
  .map(([values, speeds, opacity, ghost, ratios]) => {
    const config = clone(DEFAULT_CONFIG);
    independentEntries.forEach((entry, i) => setPath(config, entry.key, values[i]));
    for (const part of [speeds, opacity, ghost]) {
      for (const [k, v] of Object.entries(part)) setPath(config, k, v);
    }
    config.cloudLayerSpeedRatios = ratios;
    return config;
  });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Cross-field warning keys that a schema-value mutation may trigger as a side
 * effect (e.g. shrinking ghostWidth below 2 * radius, or raising basePipeSpeed
 * above maxPipeSpeed).
 */
function crossFieldKeys(config) {
  const keys = [];
  const { basePipeSpeed, maxPipeSpeed, ghostWidth, ghostHeight, ghostHitboxRadius } = config;
  if (isNum(basePipeSpeed) && isNum(maxPipeSpeed) && maxPipeSpeed < basePipeSpeed) keys.push(PAIR_KEY);
  if (
    isNum(ghostHitboxRadius) && isNum(ghostWidth) && isNum(ghostHeight) &&
    ghostHitboxRadius > Math.min(ghostWidth, ghostHeight) / 2
  ) {
    keys.push(RADIUS_KEY);
  }
  return keys;
}

/** Out-of-range value for a schema entry: just outside or far outside either bound. */
function outOfRangeArb({ min, max, step }) {
  const span = Math.max(Math.abs(min), Math.abs(max), 1);
  return fc.oneof(
    fc.constant(min - step),
    fc.constant(max + step),
    fc.constant(min - span * 1e-9),
    fc.constant(max + span * 1e-9),
    fc.double({ min: -span * 1000, max: min - step, noNaN: true }),
    fc.double({ min: max + step, max: span * 1000, noNaN: true }),
  );
}

// Mutation: one schema value out of range (R16.1).
const outOfRangeMutation = fc
  .constantFrom(...CONFIG_SCHEMA)
  .chain((entry) => outOfRangeArb(entry).map((value) => ({ key: entry.key, value })));

// Mutation: one schema value non-finite (R16.2).
const nonFiniteMutation = fc.record({
  key: fc.constantFrom(...CONFIG_SCHEMA.map((e) => e.key)),
  value: fc.constantFrom(NaN, Infinity, -Infinity),
});

// Mutation: both speeds in range but maxPipeSpeed < basePipeSpeed (R16.4).
const speedOrderMutation = fc
  .integer({ min: maxEntry.min + 1, max: baseEntry.max })
  .chain((basePipeSpeed) =>
    fc
      .integer({ min: maxEntry.min, max: basePipeSpeed - 1 })
      .map((maxPipeSpeed) => ({ speeds: { basePipeSpeed, maxPipeSpeed } })),
  );

// Mutation: one cloud ratio from {0, 1, negative, > 1} (R16.5).
const badRatioArb = fc.oneof(
  fc.constant(0),
  fc.constant(1),
  fc.double({ min: -10, max: -Number.EPSILON, noNaN: true }),
  fc.double({ min: 1 + Number.EPSILON * 2, max: 10, noNaN: true }),
);
const ratioMutation = fc.record({ ratioIndexSeed: fc.nat(), ratio: badRatioArb });

// Mutation: invalid Hitbox radius (R19.8, R19.10).
const radiusValueMutation = fc
  .constantFrom(undefined, "12", "abc", NaN, 7, 17)
  .map((value) => ({ key: RADIUS_KEY, value }));
// Radius in range [8, 16] but above half of a small sprite (e.g. 14 on 24x24).
const radiusAboveHalfMutation = fc
  .integer({ min: 24, max: 30 })
  .chain((size) =>
    fc
      .integer({ min: Math.floor(size / 2) + 1, max: radiusEntry.max })
      .map((radius) => ({ sprite: { ghostWidth: size, ghostHeight: size, ghostHitboxRadius: radius } })),
  );

const mutationArb = fc.oneof(
  outOfRangeMutation,
  nonFiniteMutation,
  speedOrderMutation,
  ratioMutation,
  radiusValueMutation,
  radiusAboveHalfMutation,
);

/**
 * A valid config with exactly one mutation applied. Returns
 * { config, mutatedKeys } where mutatedKeys are the warning keys validateConfig
 * emits for it (schema key, "maxPipeSpeed/basePipeSpeed",
 * "cloudLayerSpeedRatios[i]", or "ghostHitboxRadius").
 */
export const invalidConfigArb = fc.tuple(validConfigArb, mutationArb).map(([valid, m]) => {
  const config = clone(valid);
  const keys = new Set();

  if ("key" in m) {
    setPath(config, m.key, m.value);
    keys.add(m.key);
    for (const k of crossFieldKeys(config)) keys.add(k);
  } else if ("speeds" in m) {
    Object.assign(config, m.speeds);
    keys.add(PAIR_KEY);
  } else if ("ratio" in m) {
    const i = m.ratioIndexSeed % config.cloudLayerSpeedRatios.length;
    config.cloudLayerSpeedRatios[i] = m.ratio;
    keys.add(`cloudLayerSpeedRatios[${i}]`);
  } else if ("sprite" in m) {
    Object.assign(config, m.sprite);
    keys.add(RADIUS_KEY);
  }

  return { config, mutatedKeys: [...keys] };
});
