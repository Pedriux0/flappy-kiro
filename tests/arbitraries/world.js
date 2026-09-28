// fast-check generators for World, Ghost, pipes, dt, and InputFrame values
// (Properties 4, 6–8, 12–16, 21, 30, 41–43).
// Requirements: 8.1, 8.2, 8.3, 18.5, 18.6, 19.7
//
// Every generated World is well-formed:
//   - playArea has integer bounds with ceilingY < groundY <= height and room
//     for any valid gapHeight plus Hitbox margins;
//   - ghost.width/height come from the config, ghost.x is in [r, width / 2];
//   - every pipe fits the play area (ceilingY <= gapY, gapY + gapHeight <= groundY),
//     pipes are ordered by x with ascending unique ids, all < nextPipeId;
//   - pipe.scored === (ghost.x > pipe.x + pipe.width), passed = scored ids plus
//     some ids of already-culled pairs (all < the first live id), score = passed.size;
//   - no pending spawn: pipes is empty, or the rightmost x > width − spawnDistance
//     (so a dt = 0 step spawns nothing, or spawns at x = width when empty);
//   - pipeSpeed / speedTier match applyDifficulty for the score and config;
//   - rng and clouds come from seeded createRng calls.
//
// World variants ("safe"/"colliding"/"exactContact") describe the world as
// generated, before any step. A Playing step with dt > 0 moves the Ghost, so
// collision properties that need the generated positions should step with dt = 0
// and without `flap` (any dt = 0 spawn lands at x = width, clear of the Ghost).
import fc from "fast-check";
import { validConfigArb } from "./config.js";
import { createRng } from "../../src/core/rng.js";
import { createClouds } from "../../src/core/clouds.js";
import { applyDifficulty } from "../../src/core/difficulty.js";

/** Loop clamp on dt, in seconds (mirrors the shell's MAX_DT). */
export const MAX_DT = 1 / 30;

export const GAME_STATES = Object.freeze(["Main_Menu", "Playing", "Paused", "Game_Over"]);

/** Every InputFrame flag (design Data Models). */
export const INPUT_FLAGS = Object.freeze([
  "flap",
  "pointer",
  "startKey",
  "playPressed",
  "highScoresPressed",
  "backPressed",
  "toggleBestScore",
  "escape",
  "togglePause",
  "restart",
]);

/** An InputFrame with every flag false. */
export const NO_INPUT = Object.freeze(Object.fromEntries(INPUT_FLAGS.map((f) => [f, false])));

/** Kinds for collidingWorldArb. */
export const COLLISION_KINDS = Object.freeze(["pipe", "ground", "ceiling"]);

/**
 * Kinds for exactContactWorldArb (distance == r exactly, which is not a hit, R19.7):
 * ground (y + r == groundY), ceiling (y − r == ceilingY), pipeLeft / pipeRight
 * (centre r beside a pipe's vertical edge), gapTop / gapBottom (centre r inside
 * the Gap from the top pipe's bottom edge / the bottom pipe's top edge).
 */
export const CONTACT_KINDS = Object.freeze(["ground", "ceiling", "pipeLeft", "pipeRight", "gapTop", "gapBottom"]);

export const DEFAULT_PLAY_AREA = Object.freeze({ width: 480, height: 640, groundY: 600, ceilingY: 0 });

// ---------------------------------------------------------------------------
// Primitive generators
// ---------------------------------------------------------------------------

export const stateArb = fc.constantFrom(...GAME_STATES);

/** dt in seconds within [0, MAX_DT], biased toward 0 and MAX_DT. */
export const dtArb = fc.oneof(
  fc.constant(0),
  fc.constant(MAX_DT),
  fc.constant(1 / 60),
  fc.double({ min: 0, max: MAX_DT, noNaN: true }),
);

/**
 * Integer play area. The playable span groundY − ceilingY is at least 420,
 * which fits the largest gapHeight (300) plus 4 · max radius (64).
 */
export const playAreaArb = fc.oneof(
  fc.constant(DEFAULT_PLAY_AREA),
  fc
    .record({
      width: fc.integer({ min: 320, max: 640 }),
      height: fc.integer({ min: 560, max: 800 }),
      ceilingY: fc.integer({ min: 0, max: 40 }),
      groundHeight: fc.integer({ min: 0, max: 100 }),
    })
    .map(({ width, height, ceilingY, groundHeight }) => ({
      width,
      height,
      groundY: height - groundHeight,
      ceilingY,
    })),
);

/** Integer or double in [min, max], biased toward the bounds. */
const numIn = (min, max) =>
  fc.oneof(
    fc.constant(min),
    fc.constant(max),
    fc.integer({ min: Math.ceil(min), max: Math.floor(max) }),
    fc.double({ min, max, noNaN: true }),
  );

const intIn = (min, max) => fc.integer({ min, max });

const vyArb = (config) =>
  fc.oneof(fc.constant(0), numIn(config.physics.flapVelocity, config.physics.terminalVelocity));

/** Ghost x: integer (exact geometry) or double, within [r, width / 2]. */
const ghostXArb = (config, playArea) => numIn(config.ghostHitboxRadius, Math.floor(playArea.width / 2));

/**
 * Ghost for a config and play area.
 * region "any":  y anywhere in [ceilingY − 2r, groundY + 2r] (may hit Ground/Ceiling)
 * region "free": y in [ceilingY + r, groundY − r] (never hits Ground/Ceiling; bounds are exact contact)
 * @param {object} config GameConfig
 * @param {{width:number,height:number,groundY:number,ceilingY:number}} playArea
 * @param {"any" | "free"} [region]
 */
export function ghostArb(config, playArea, region = "any") {
  const r = config.ghostHitboxRadius;
  const [lo, hi] =
    region === "free"
      ? [playArea.ceilingY + r, playArea.groundY - r]
      : [playArea.ceilingY - 2 * r, playArea.groundY + 2 * r];
  return fc.record({ x: ghostXArb(config, playArea), y: numIn(lo, hi), vy: vyArb(config) }).map((g) => ({
    ...g,
    width: config.ghostWidth,
    height: config.ghostHeight,
  }));
}

// ---------------------------------------------------------------------------
// Geometry reference (independent of src/core/collision.js; squared distance, strict <)
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function circleHitsRect(cx, cy, r, x, y, w, h) {
  const dx = cx - clamp(cx, x, x + w);
  const dy = cy - clamp(cy, y, y + h);
  return dx * dx + dy * dy < r * r;
}

/** True if the Hitbox overlaps the pipe's top or bottom rect. */
export function hitboxHitsPipe(ghost, pipe, playArea, r) {
  const bottomY = pipe.gapY + pipe.gapHeight;
  return (
    circleHitsRect(ghost.x, ghost.y, r, pipe.x, playArea.ceilingY, pipe.width, pipe.gapY - playArea.ceilingY) ||
    circleHitsRect(ghost.x, ghost.y, r, pipe.x, bottomY, pipe.width, playArea.groundY - bottomY)
  );
}

/** Reference collision: Ground, Ceiling, or any pipe (R8.1–8.3, R19.7). */
export function referenceCollides(ghost, pipes, playArea, r) {
  if (ghost.y + r > playArea.groundY || ghost.y - r < playArea.ceilingY) return true;
  return pipes.some((p) => hitboxHitsPipe(ghost, p, playArea, r));
}

// ---------------------------------------------------------------------------
// Pipes
// ---------------------------------------------------------------------------

/** gapHeight: usually config.gapHeight; sometimes another valid value (pairs keep their spawn-time gap, R15.7). */
const gapHeightArb = (config, playArea) =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constant(config.gapHeight) },
    { weight: 1, arbitrary: intIn(100, Math.min(300, playArea.groundY - playArea.ceilingY)) },
  );

/** One pipe (without id/scored) that fits the play area. */
const rawPipeArb = (config, playArea) =>
  gapHeightArb(config, playArea).chain((gapHeight) =>
    fc
      .record({
        x: numIn(-config.pipeWidth, playArea.width + config.spawnDistance),
        gapY: numIn(playArea.ceilingY, playArea.groundY - gapHeight),
      })
      .map(({ x, gapY }) => ({ x, width: config.pipeWidth, gapY, gapHeight })),
  );

/** Sort by x, assign ascending ids from firstId with small gaps, set scored from ghostX. */
function finalizePipes(raw, ghostX, firstId, idGaps) {
  const sorted = [...raw].sort((a, b) => a.x - b.x);
  let id = firstId;
  return sorted.map((p, i) => {
    if (i > 0) id += 1 + (idGaps[i] ?? 0);
    return { id, ...p, scored: ghostX > p.x + p.width };
  });
}

/**
 * 0..maxLength pipes that fit the play area, ordered by x with unique ascending
 * ids starting at `firstId`, and `scored` consistent with `ghostX`.
 * Pipes may overlap the Ghost; see safeWorldArb for non-overlapping worlds.
 */
export function pipesArb(config, playArea, { ghostX = 0, maxLength = 4, firstId = 0 } = {}) {
  return fc
    .record({
      raw: fc.array(rawPipeArb(config, playArea), { maxLength }),
      idGaps: fc.array(intIn(0, 2), { minLength: maxLength + 1, maxLength: maxLength + 1 }),
    })
    .map(({ raw, idGaps }) => finalizePipes(raw, ghostX, firstId, idGaps));
}

// ---------------------------------------------------------------------------
// Ghost + target pipe per variant
// ---------------------------------------------------------------------------

/** Colliding scene: { ghost, target? } where the Hitbox strictly overlaps `kind`. */
function collidingSceneArb(config, playArea, kind) {
  const r = config.ghostHitboxRadius;
  const { groundY, ceilingY } = playArea;
  const depth = fc.oneof(intIn(1, 2 * r), fc.double({ min: 1e-6, max: 2 * r, noNaN: true }));
  const base = fc.record({ x: ghostXArb(config, playArea), vy: vyArb(config) });

  if (kind === "ground") return fc.tuple(base, depth).map(([g, d]) => ({ ghost: { ...g, y: groundY - r + d } }));
  if (kind === "ceiling") return fc.tuple(base, depth).map(([g, d]) => ({ ghost: { ...g, y: ceilingY + r - d } }));

  // pipe: the centre is within the top (or bottom) rect's vertical span and
  // less than r away horizontally, so the Hitbox overlaps that rect.
  const gapHeight = config.gapHeight;
  const w = config.pipeWidth;
  return fc
    .record({
      g: fc.record({ x: intIn(r, Math.floor(playArea.width / 2)), vy: vyArb(config) }),
      gapY: intIn(ceilingY + 2 * r, groundY - gapHeight - 2 * r),
      top: fc.boolean(),
      k: fc.oneof(intIn(-(r - 1), w + r - 1), fc.double({ min: -r + 1e-6, max: w + r - 1e-6, noNaN: true })),
      t: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map(({ g, gapY, top, k, t }) => {
      const [lo, hi] = top ? [ceilingY + r, gapY] : [gapY + gapHeight, groundY - r];
      const y = lo + t * (hi - lo);
      return {
        ghost: { ...g, y: Math.min(hi, Math.max(lo, y)) },
        target: { x: g.x - k, width: w, gapY, gapHeight },
      };
    });
}

/** Exact-contact scene: integer geometry with distance == r to `kind`, and no overlap. */
function contactSceneArb(config, playArea, kind) {
  const r = config.ghostHitboxRadius;
  const { groundY, ceilingY } = playArea;
  const gx = intIn(r, Math.floor(playArea.width / 2));
  const base = fc.record({ x: gx, vy: vyArb(config) });

  if (kind === "ground") return base.map((g) => ({ ghost: { ...g, y: groundY - r } }));
  if (kind === "ceiling") return base.map((g) => ({ ghost: { ...g, y: ceilingY + r } }));

  const gapHeight = config.gapHeight;
  const w = config.pipeWidth;
  return fc
    .record({
      g: base,
      gapY: intIn(ceilingY + 2 * r, groundY - gapHeight - 2 * r),
      spanT: fc.double({ min: 0, max: 1, noNaN: true }),
      k: intIn(0, w),
    })
    .map(({ g, gapY, spanT, k }) => {
      if (kind === "pipeLeft" || kind === "pipeRight") {
        // Centre inside the top rect's vertical span (integer), r left/right of the edge.
        const y = Math.round(ceilingY + r + spanT * (gapY - ceilingY - r));
        const x = kind === "pipeLeft" ? g.x + r : g.x - r - w;
        return { ghost: { ...g, y }, target: { x, width: w, gapY, gapHeight } };
      }
      // gapTop / gapBottom: centre horizontally within the pipe, r from the Gap edge.
      const y = kind === "gapTop" ? gapY + r : gapY + gapHeight - r;
      return { ghost: { ...g, y }, target: { x: g.x - k, width: w, gapY, gapHeight } };
    });
}

/** Scene for a variant: { ghost (no size yet), target?, kind? }. */
function sceneArb(config, playArea, variant, kind) {
  if (variant === "colliding") {
    const kindArb = kind ? fc.constant(kind) : fc.constantFrom(...COLLISION_KINDS);
    return kindArb.chain((k) => collidingSceneArb(config, playArea, k).map((s) => ({ ...s, kind: k })));
  }
  if (variant === "exactContact") {
    const kindArb = kind ? fc.constant(kind) : fc.constantFrom(...CONTACT_KINDS);
    return kindArb.chain((k) => contactSceneArb(config, playArea, k).map((s) => ({ ...s, kind: k })));
  }
  const region = variant === "safe" ? "free" : "any";
  return ghostArb(config, playArea, region).map((ghost) => ({ ghost, kind: null }));
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

const VARIANTS = ["any", "safe", "colliding", "exactContact"];

/**
 * World for a fixed config.
 * @param {object} config GameConfig
 * @param {{
 *   state?: string,              // fixed Game_State; default any
 *   variant?: "any" | "safe" | "colliding" | "exactContact" | "mixed", // default "mixed"
 *   kind?: string,               // COLLISION_KINDS / CONTACT_KINDS entry for colliding / exactContact
 *   playArea?: object,           // fixed PlayArea; default playAreaArb
 *   bestScoreOpen?: boolean,     // fixed panel state; default both
 *   maxPipes?: number,           // extra (non-target) pipes, default 4
 * }} [options]
 * @returns {fc.Arbitrary<{ world: object, variant: string, kind: string | null }>}
 */
export function worldForConfigArb(config, options = {}) {
  const { state, variant = "mixed", kind, playArea, bestScoreOpen, maxPipes = 4 } = options;
  const variantArb =
    variant === "mixed"
      ? fc.oneof(
          { weight: 2, arbitrary: fc.constant("safe") },
          { weight: 1, arbitrary: fc.constant("any") },
          { weight: 1, arbitrary: fc.constant("colliding") },
          { weight: 1, arbitrary: fc.constant("exactContact") },
        )
      : fc.constant(variant);
  const areaArb = playArea ? fc.constant(playArea) : playAreaArb;

  return fc.tuple(variantArb, areaArb).chain(([v, area]) =>
    sceneArb(config, area, v, kind).chain((scene) =>
      fc
        .record({
          state: state ? fc.constant(state) : stateArb,
          raw: fc.array(rawPipeArb(config, area), { maxLength: maxPipes }),
          idGaps: fc.array(intIn(0, 2), { minLength: maxPipes + 2, maxLength: maxPipes + 2 }),
          firstId: intIn(0, 40),
          culledMask: fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
          nextIdSlack: intIn(0, 3),
          leader: fc.record({
            xT: fc.double({ min: 0, max: 1, noNaN: true }),
            gapT: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          highScore: fc.oneof(fc.constant(0), fc.nat({ max: 200 })),
          seed: fc.integer(),
          cloudSeed: fc.integer(),
          muted: fc.boolean(),
          bestScoreOpen: bestScoreOpen === undefined ? fc.boolean() : fc.constant(bestScoreOpen),
        })
        .map((d) => {
          const r = config.ghostHitboxRadius;
          const ghost = { ...scene.ghost, width: config.ghostWidth, height: config.ghostHeight };
          // Non-target pipes never overlap the Ghost except in the "any" variant,
          // so colliding/exactContact worlds collide (or touch) only via `kind`.
          const others = v === "any" ? d.raw : d.raw.filter((p) => !hitboxHitsPipe(ghost, p, area, r));
          const raw = scene.target ? [...others, scene.target] : others;
          // No pending spawn (as in a real session): with pipes present, the
          // rightmost one is closer than spawnDistance to the spawn edge. Otherwise
          // add a leader pair strictly right of the Hitbox, so a dt = 0 step never
          // spawns a pair on top of the Ghost.
          const rightmost = raw.length ? Math.max(...raw.map((p) => p.x)) : Infinity;
          if (raw.length && area.width - rightmost >= config.spawnDistance) {
            const lo = Math.floor(Math.max(area.width - config.spawnDistance, ghost.x + r)) + 1;
            const gapHeight = config.gapHeight;
            raw.push({
              x: lo + Math.round(d.leader.xT * (area.width - lo)),
              width: config.pipeWidth,
              gapY: area.ceilingY + d.leader.gapT * (area.groundY - gapHeight - area.ceilingY),
              gapHeight,
            });
          }
          const pipes = finalizePipes(raw, ghost.x, d.firstId, d.idGaps);
          const lastId = pipes.length ? pipes[pipes.length - 1].id : d.firstId - 1;
          const nextPipeId = lastId + 1 + d.nextIdSlack;

          const passed = new Set();
          for (let id = 0; id < d.firstId; id++) if (d.culledMask[id]) passed.add(id);
          for (const p of pipes) if (p.scored) passed.add(p.id);
          const score = passed.size;
          const { pipeSpeed, speedTier } = applyDifficulty({ score }, config);

          const world = {
            state: d.state,
            ghost,
            pipes,
            clouds: createClouds(config, area, createRng(d.cloudSeed)).clouds,
            score,
            highScore: d.highScore,
            playArea: { ...area },
            pipeSpeed,
            speedTier,
            rng: createRng(d.seed),
            muted: d.muted,
            menu: { bestScoreOpen: d.bestScoreOpen },
            passed,
            nextPipeId,
          };
          return { world, variant: v, kind: scene.kind };
        }),
    ),
  );
}

/**
 * { world, config, variant, kind } with config from validConfigArb.
 * `state` fixes the Game_State (default: any). Options as in worldForConfigArb.
 */
export function worldArb(state, options = {}) {
  return validConfigArb.chain((config) =>
    worldForConfigArb(config, { ...options, state }).map((w) => ({ ...w, config })),
  );
}

/** Worlds where the Hitbox touches nothing (exact contact allowed). */
export const safeWorldArb = (state, options = {}) => worldArb(state, { ...options, variant: "safe" });

/** Worlds where the Hitbox strictly overlaps a pipe, the Ground, or the Ceiling (`kind`). */
export const collidingWorldArb = (state, kind, options = {}) =>
  worldArb(state, { ...options, variant: "colliding", kind });

/** Worlds with exact contact (distance == r) and no overlap; `kind` from CONTACT_KINDS. */
export const exactContactWorldArb = (state, kind, options = {}) =>
  worldArb(state, { ...options, variant: "exactContact", kind });

export { VARIANTS as WORLD_VARIANTS };

// ---------------------------------------------------------------------------
// InputFrame
// ---------------------------------------------------------------------------

const allFlagsArb = fc.record(Object.fromEntries(INPUT_FLAGS.map((f) => [f, fc.boolean()])));

const START_FLAGS = ["startKey", "playPressed", "pointer", "flap"];
const PANEL_FLAGS = ["highScoresPressed", "toggleBestScore", "backPressed", "escape"];

/** Frames that set at least one start flag and at least one panel flag together (R18.6). */
const startAndPanelArb = fc
  .record({
    rest: allFlagsArb,
    start: fc.subarray(START_FLAGS, { minLength: 1 }),
    panel: fc.subarray(PANEL_FLAGS, { minLength: 1 }),
  })
  .map(({ rest, start, panel }) => {
    const frame = { ...rest };
    for (const f of [...start, ...panel]) frame[f] = true;
    return frame;
  });

/** A frame with exactly one flag set. */
const singleFlagArb = fc.constantFrom(...INPUT_FLAGS).map((f) => ({ ...NO_INPUT, [f]: true }));

/** InputFrame with arbitrary combinations of every flag, including empty, single-flag, and start+panel frames. */
export const inputFrameArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ ...NO_INPUT }) },
  { weight: 2, arbitrary: singleFlagArb },
  { weight: 3, arbitrary: allFlagsArb },
  { weight: 2, arbitrary: startAndPanelArb },
);
