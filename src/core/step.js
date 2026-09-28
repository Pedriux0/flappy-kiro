// The pure reducer that advances the simulation by one frame.
//
// stepWorld(world, input, dt, config) -> { world, effects }
//
// - Dispatches on world.state (explicit FSM: Main_Menu, Playing, Paused, Game_Over).
// - Reads every tuning value from the `config` argument on every call, never
//   from copies in World, so live Tuning_Panel edits apply on the next frame
//   without resetting the session (R17.5, R17.10).
// - Never mutates its inputs; always returns a fresh { world, effects } result.
// - Collisions are evaluated only while Playing (R19.11).
//
// Effect shapes (design Data Models):
//   { type: "PlaySound", sound: "jump" | "gameOver" }
//   { type: "PersistHighScore", value: number }
//   { type: "FlapApplied" }
//   { type: "StateEntered", state: "Playing" | "Paused" | "Game_Over" | "Main_Menu" }

import { applyFlap, integrate } from "./physics.js";
import { scrollPipes, cullPipes, maybeSpawnPipe } from "./pipes.js";
import { updateScore } from "./scoring.js";
import { applyDifficulty } from "./difficulty.js";
import { scrollClouds } from "./clouds.js";
import { checkCollisions } from "./collision.js";
import { resetToMenu } from "./world.js";

/** Effect constructors, so every effect uses the exact design field names. */
const fx = {
  flapApplied: () => ({ type: "FlapApplied" }),
  playSound: (sound) => ({ type: "PlaySound", sound }),
  persistHighScore: (value) => ({ type: "PersistHighScore", value }),
  stateEntered: (state) => ({ type: "StateEntered", state }),
};

/** Effects emitted on every applied Flap (R13.1, R20.2). */
function flapEffects() {
  return [fx.flapApplied(), fx.playSound("jump")];
}

/** Return the world with the Best_Score_Panel set open or closed (new objects only). */
function withPanel(world, open) {
  return { ...world, menu: { ...world.menu, bestScoreOpen: open } };
}

/**
 * Main_Menu: Best_Score_Panel sub-state and the start transition (R2.1–2.3, R18).
 *
 * - Panel open: Back / Esc / H closes it; every other input is ignored (R18.4, R18.5, R18.11).
 * - Panel closed: High Scores / H opens it (R18.2). Panel inputs win over start
 *   inputs in the same frame, so such a frame never starts or flaps (R18.6).
 * - Otherwise startKey (Space/Enter), playPressed, or pointer (click/tap on no
 *   button) starts the game (R2.1, R18.7). The controller sets startKey for
 *   Space and pointer for a bare click/tap alongside `flap`, so `flap` alone is
 *   not a start input (design input-mapping table).
 *
 * The start frame applies only the first Flap (R2.3, R20.2); no physics,
 * scrolling, or spawning runs outside Playing (design stepWorld notes), so the
 * first integration happens on the next Playing frame.
 */
function stepMainMenu(world, input, _dt, config) {
  const panelOpen = Boolean(world.menu?.bestScoreOpen);

  if (panelOpen) {
    if (input.backPressed || input.escape || input.toggleBestScore) {
      return { world: withPanel(world, false), effects: [] };
    }
    return { world, effects: [] };
  }

  if (input.highScoresPressed || input.toggleBestScore) {
    return { world: withPanel(world, true), effects: [] };
  }

  if (input.startKey || input.playPressed || input.pointer) {
    const started = {
      ...world,
      state: "Playing",
      ghost: applyFlap(world.ghost, config.physics.flapVelocity),
      // Pipes and the scored set are already empty on Main_Menu entry; clearing
      // them again keeps every round starting clean regardless of how we got here.
      pipes: [],
      passed: new Set(),
      score: 0,
      pipeSpeed: config.basePipeSpeed,
      speedTier: 0,
    };
    return {
      world: started,
      effects: [...flapEffects(), fx.stateEntered("Playing")],
    };
  }

  return { world, effects: [] };
}

/**
 * Playing: pause toggle, or the full update pipeline
 * flap → integrate → spawn/cull → score → difficulty → scroll → collide.
 */
function stepPlaying(world, input, dt, config) {
  // Pause wins over everything else in the same frame, and changes nothing else (R5.1, R5.2).
  if (input.togglePause) {
    return {
      world: { ...world, state: "Paused" },
      effects: [fx.stateEntered("Paused")],
    };
  }

  const effects = [];

  // 1. Flap: only from input.flap (click/tap/Space). Enter sets startKey only,
  //    so it never flaps here (R3.1–3.4).
  let ghost = world.ghost;
  if (input.flap) {
    ghost = applyFlap(ghost, config.physics.flapVelocity);
    effects.push(...flapEffects());
  }

  // 2. Integrate gravity + terminal cap; x is unchanged (R4.1–4.4, R14).
  ghost = integrate(ghost, dt, config.physics);

  // 3. Spawn, then cull (R6.2, R6.4, R6.5). The caller owns nextPipeId.
  const spawned = maybeSpawnPipe(world.pipes, world, config, world.rng);
  let nextPipeId = world.nextPipeId;
  if (spawned.pipes.length > world.pipes.length) {
    const newPipe = spawned.pipes[spawned.pipes.length - 1];
    nextPipeId = Math.max(nextPipeId ?? 0, newPipe.id + 1);
  }
  let pipes = cullPipes(spawned.pipes);

  // 4. Score against the moved Ghost and the pre-scroll pipes (R7.1, R7.2).
  //    Mark newly passed pairs scored = true so each pair counts once.
  const { score, passed } = updateScore(world, { ...world, ghost, pipes });
  pipes = pipes.map((p) => (passed.has(p.id) && !p.scored ? { ...p, scored: true } : p));

  // 5. Difficulty from the updated score (R15.1–15.5).
  const { pipeSpeed, speedTier } = applyDifficulty({ ...world, score }, config);

  // 6. Scroll pipes and clouds at the single shared pipeSpeed (R6.1, R12.8, R15.5, R15.6).
  pipes = scrollPipes(pipes, dt, pipeSpeed);
  const clouds = scrollClouds(world.clouds, dt, pipeSpeed, config.cloudLayerSpeedRatios);

  const moved = {
    ...world,
    ghost,
    pipes,
    clouds,
    score,
    passed,
    pipeSpeed,
    speedTier,
    rng: spawned.rng,
    nextPipeId,
  };

  // 7. Collide after this frame's movement (R8.1–8.3, R19.5, R19.6).
  if (!checkCollisions(moved.ghost, moved.pipes, moved.playArea, config)) {
    return { world: moved, effects };
  }

  // Game_Over: freeze, resolve and maybe persist the High_Score (R8.4, R8.5, R9.1–9.3, R13.2).
  const highScore = Math.max(moved.score, moved.highScore);
  effects.push(fx.playSound("gameOver"), fx.stateEntered("Game_Over"));
  if (highScore > moved.highScore) effects.push(fx.persistHighScore(highScore));
  return { world: { ...moved, state: "Game_Over", highScore }, effects };
}

/** Paused: only togglePause resumes; flap and dt are ignored (R5.2–5.5). */
function stepPaused(world, input) {
  if (input.togglePause) {
    return {
      world: { ...world, state: "Playing" },
      effects: [fx.stateEntered("Playing")],
    };
  }
  return { world, effects: [] };
}

/** Game_Over: pointer, startKey, or restart returns to a clean Main_Menu; otherwise frozen (R8.4, R8.5, R10.2–10.5, R18.9). */
function stepGameOver(world, input, _dt, config) {
  if (input.pointer || input.startKey || input.restart) {
    return {
      world: resetToMenu(world, config),
      effects: [fx.stateEntered("Main_Menu")],
    };
  }
  return { world, effects: [] };
}

const HANDLERS = {
  Main_Menu: stepMainMenu,
  Playing: stepPlaying,
  Paused: stepPaused,
  Game_Over: stepGameOver,
};

/**
 * Advance the world by one frame.
 * @param {object} world World (never mutated)
 * @param {object} input InputFrame; missing flags are treated as false
 * @param {number} dt seconds (already clamped by the loop)
 * @param {object} config GameConfig for this frame
 * @returns {{ world: object, effects: Array<object> }}
 */
export function stepWorld(world, input, dt, config) {
  const handler = HANDLERS[world.state];
  if (!handler) return { world, effects: [] };
  return handler(world, input ?? {}, dt, config);
}
