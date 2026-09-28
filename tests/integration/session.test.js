// Session integration test (task 11.1).
//
// Drives the pure core (stepWorld + stepAnimation) with DEFAULT_CONFIG, a
// seeded RNG and a fixed dt of 1/60 s through one full session:
//   Main_Menu → Best_Score_Panel open → closed → Playing → Paused → Playing
//   → Game_Over → Main_Menu
// A simple controller keeps the Ghost alive (flap when it sinks below the next
// Gap's centre) until pipes have been scored, then stops flapping so the Ghost
// falls and the round ends with a new best.
//
// Validates: Requirements 2.1, 5.1, 5.4, 8.1, 9.1, 9.3, 10.2, 10.5, 13.1, 13.2,
// 17.5, 18.2, 18.4, 18.9, 20.2, 20.4, 20.6, 20.13
import { describe, it, expect } from "vitest";
import { stepWorld } from "../../src/core/step.js";
import { initialAnimState, stepAnimation } from "../../src/core/animation.js";
import { createInitialWorld } from "../../src/core/world.js";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { createRng } from "../../src/core/rng.js";
import { createPlayArea } from "../../src/shell/constants.js";
import { NO_INPUT } from "../arbitraries/world.js";

const DT = 1 / 60;
const DT_MS = DT * 1000;
const MAX_ROUND_FRAMES = 60 * 120; // generous safety cap (2 minutes of play)

/** Build an InputFrame with the given flags set. */
const input = (flags = {}) => ({ ...NO_INPUT, ...flags });

const types = (effects) => effects.map((e) => e.type);
const hasEffect = (effects, match) =>
  effects.some((e) => Object.entries(match).every(([k, v]) => e[k] === v));

/** A tiny session harness mirroring the game loop: stepWorld, then stepAnimation. */
function createSession(seed = 20240501) {
  const s = {
    config: DEFAULT_CONFIG,
    world: createInitialWorld(DEFAULT_CONFIG, createPlayArea(), 0, createRng(seed)),
    anim: initialAnimState(),
    effects: [],
    step(frame = NO_INPUT) {
      const result = stepWorld(s.world, frame, DT, s.config);
      s.world = result.world;
      s.effects = result.effects;
      s.anim = stepAnimation(s.anim, result.effects, DT_MS, s.world, s.config, false);
      return result;
    },
  };
  return s;
}

/** Gap centre of the first pipe the Ghost has not fully passed, or mid-play-area. */
function targetY(world) {
  const r = DEFAULT_CONFIG.ghostHitboxRadius;
  const next = world.pipes
    .filter((p) => p.x + p.width > world.ghost.x - r)
    .sort((a, b) => a.x - b.x)[0];
  if (!next) return (world.playArea.groundY + world.playArea.ceilingY) / 2;
  return next.gapY + next.gapHeight / 2;
}

/** Controller: flap only while sinking below the target Gap centre. */
function controllerInput(world) {
  const flap = world.ghost.y > targetY(world) && world.ghost.vy >= 0;
  return input({ flap });
}

describe("session integration", () => {
  it("plays a full session through every state with correct effects and animation", () => {
    const s = createSession();
    const initial = s.world;
    const animKinds = [s.anim.kind];
    const recordKind = () => {
      if (animKinds[animKinds.length - 1] !== s.anim.kind) animKinds.push(s.anim.kind);
    };

    // --- Main_Menu idle -----------------------------------------------------
    expect(s.world.state).toBe("Main_Menu");
    expect(s.world.menu.bestScoreOpen).toBe(false);
    for (let i = 0; i < 30; i++) {
      s.step();
      expect(s.world.state).toBe("Main_Menu");
      expect(s.anim.kind).toBe("Idle");
    }

    // --- Best_Score_Panel open: never starts a game (R18.2, R18.4) ------------
    s.step(input({ highScoresPressed: true }));
    expect(s.world.state).toBe("Main_Menu");
    expect(s.world.menu.bestScoreOpen).toBe(true);
    expect(s.effects).toEqual([]);
    // Start-like inputs while the panel is open are ignored.
    for (const flags of [{ startKey: true, flap: true }, { pointer: true, flap: true }, { playPressed: true }]) {
      s.step(input(flags));
      expect(s.world.state).toBe("Main_Menu");
      expect(s.world.menu.bestScoreOpen).toBe(true);
      expect(s.effects).toEqual([]);
      expect(s.anim.kind).toBe("Idle");
    }

    // --- Best_Score_Panel closed via Back -----------------------------------
    s.step(input({ backPressed: true }));
    expect(s.world.state).toBe("Main_Menu");
    expect(s.world.menu.bestScoreOpen).toBe(false);
    expect(s.effects).toEqual([]);
    expect(s.world.ghost).toEqual(initial.ghost);
    expect(s.world.score).toBe(0);
    expect(s.anim.kind).toBe("Idle");

    // --- Start: Space applies the first Flap (R2.1, R13.1, R20.2) ---------------
    s.step(input({ startKey: true, flap: true }));
    expect(s.world.state).toBe("Playing");
    expect(types(s.effects)).toContain("FlapApplied");
    expect(hasEffect(s.effects, { type: "PlaySound", sound: "jump" })).toBe(true);
    expect(hasEffect(s.effects, { type: "StateEntered", state: "Playing" })).toBe(true);
    expect(s.world.ghost.vy).toBe(DEFAULT_CONFIG.physics.flapVelocity);
    expect(s.anim).toMatchObject({ kind: "Flap", frame: 0, elapsedMs: 0 });
    recordKind();

    // --- Flap → Glide 200 ms after the last flap (R20.4) -----------------------
    // Flap frames last 60 + 60 + 80 = 200 ms; each frame advances 1000/60 ms.
    for (let i = 1; i <= 11; i++) {
      s.step();
      expect(s.world.state).toBe("Playing");
      expect(s.anim.kind).toBe("Flap"); // ≤ 183.3 ms elapsed
    }
    s.step(); // 200 ms (±float rounding)
    s.step(); // 216.7 ms: definitely past the Flap animation
    expect(s.world.state).toBe("Playing");
    expect(s.anim.kind).toBe("Glide");
    recordKind();

    // --- Pause and resume (R5.1, R5.4) -----------------------------------------
    s.step(input({ togglePause: true }));
    expect(s.world.state).toBe("Paused");
    expect(hasEffect(s.effects, { type: "StateEntered", state: "Paused" })).toBe(true);
    const pausedWorld = s.world;
    const pausedAnim = s.anim;
    for (let i = 0; i < 20; i++) {
      s.step(input({ flap: true }));
      expect(s.world).toBe(pausedWorld); // frozen, flaps ignored
      expect(s.effects).toEqual([]);
      expect(s.anim).toEqual(pausedAnim); // animation frozen too
    }
    s.step(input({ togglePause: true }));
    expect(s.world.state).toBe("Playing");
    expect(hasEffect(s.effects, { type: "StateEntered", state: "Playing" })).toBe(true);
    expect(s.world.ghost).toEqual(pausedWorld.ghost);

    // --- Play with the controller until at least one pipe is scored ----------
    let flapCount = 0;
    let configChanged = false;
    let frames = 0;
    while (s.world.state === "Playing" && s.world.score < 3 && frames < MAX_ROUND_FRAMES) {
      const before = s.world;
      const frame = controllerInput(before);
      s.step(frame);
      frames += 1;
      recordKind();
      if (frame.flap) {
        flapCount += 1;
        expect(types(s.effects)).toContain("FlapApplied");
        expect(hasEffect(s.effects, { type: "PlaySound", sound: "jump" })).toBe(true);
        expect(s.anim).toMatchObject({ kind: "Flap", frame: 0, elapsedMs: 0 });
      } else if (s.world.state === "Playing") {
        expect(types(s.effects)).not.toContain("FlapApplied");
      }

      // Mid-session tuning change right after the first scored pipe (R17.5).
      if (!configChanged && s.world.state === "Playing" && s.world.score >= 1) {
        configChanged = true;
        const snapshot = s.world;
        s.config = setConfigValue(s.config, "physics.gravity", 1500);
        s.step(); // no flap: gravity alone changes vy
        frames += 1;
        recordKind();
        expect(s.world.state).toBe("Playing");
        expect(s.world.score).toBe(snapshot.score); // not reset
        expect(s.world.highScore).toBe(snapshot.highScore);
        expect(s.world.ghost.x).toBe(snapshot.ghost.x);
        expect(s.world.pipes.length).toBeGreaterThan(0);
        expect(s.world.pipes.map((p) => p.id)).toEqual(
          expect.arrayContaining(snapshot.pipes.filter((p) => p.x + p.width >= 0).map((p) => p.id)),
        );
        if (snapshot.ghost.vy + 1500 * DT < DEFAULT_CONFIG.physics.terminalVelocity) {
          expect(s.world.ghost.vy - snapshot.ghost.vy).toBeCloseTo(1500 * DT, 9);
        }
      }
    }
    expect(s.world.state, "controller should keep the ghost alive until scoring").toBe("Playing");
    expect(s.world.score).toBeGreaterThanOrEqual(3);
    expect(configChanged).toBe(true);
    expect(flapCount).toBeGreaterThan(0);
    expect(s.config.physics.gravity).toBe(1500);

    // --- Stop flapping: the Ghost falls and collides (R8.1, R9.1, R9.3, R13.2) --
    const scoreAtDeath = s.world.score;
    let gameOverEffects = null;
    for (let i = 0; i < 60 * 10 && s.world.state === "Playing"; i++) {
      s.step();
      recordKind();
      if (s.world.state === "Game_Over") gameOverEffects = s.effects;
    }
    expect(s.world.state).toBe("Game_Over");
    expect(gameOverEffects).not.toBeNull();
    expect(hasEffect(gameOverEffects, { type: "PlaySound", sound: "gameOver" })).toBe(true);
    expect(hasEffect(gameOverEffects, { type: "StateEntered", state: "Game_Over" })).toBe(true);
    expect(s.world.score).toBeGreaterThanOrEqual(scoreAtDeath);
    const finalScore = s.world.score;
    expect(finalScore).toBeGreaterThan(initial.highScore);
    expect(gameOverEffects).toContainEqual({ type: "PersistHighScore", value: finalScore });
    expect(s.world.highScore).toBe(finalScore);
    expect(s.anim).toMatchObject({ kind: "Death", frame: 0 }); // R20.6
    const lockedRotation = s.anim.rotationDeg;

    // Game_Over is frozen; the Death animation plays out with locked rotation.
    const overWorld = s.world;
    for (let i = 0; i < 60; i++) {
      s.step(input({ flap: true }));
      expect(s.world).toBe(overWorld);
      expect(s.effects).toEqual([]);
      expect(s.anim.kind).toBe("Death");
      expect(s.anim.rotationDeg).toBe(lockedRotation);
    }

    // --- Restart → clean Main_Menu with the panel closed (R10.2, R10.5, R18.9, R20.13)
    s.step(input({ restart: true }));
    expect(s.world.state).toBe("Main_Menu");
    expect(hasEffect(s.effects, { type: "StateEntered", state: "Main_Menu" })).toBe(true);
    expect(s.world.menu.bestScoreOpen).toBe(false);
    expect(s.world.score).toBe(0);
    expect(s.world.pipes).toEqual([]);
    expect(s.world.passed.size).toBe(0);
    expect(s.world.pipeSpeed).toBe(s.config.basePipeSpeed);
    expect(s.world.speedTier).toBe(0);
    expect(s.world.ghost).toEqual(initial.ghost);
    expect(s.world.highScore).toBe(finalScore); // kept across rounds
    expect(s.anim).toEqual(initialAnimState());
    recordKind();

    // Animation kind sequence: Idle → Flap → Glide → … → Death → Idle.
    expect(animKinds[0]).toBe("Idle");
    expect(animKinds.slice(1, 3)).toEqual(["Flap", "Glide"]);
    expect(animKinds.slice(-2)).toEqual(["Death", "Idle"]);
    const middle = animKinds.slice(1, -2);
    expect(middle.every((k) => k === "Flap" || k === "Glide")).toBe(true);

    // The next round starts cleanly from the reset menu.
    s.step(input({ playPressed: true }));
    expect(s.world.state).toBe("Playing");
    expect(s.world.score).toBe(0);
    expect(s.anim.kind).toBe("Flap");
  });
});
