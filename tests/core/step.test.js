import { describe, it, expect } from "vitest";
import { stepWorld } from "../../src/core/step.js";
import { createInitialWorld, resetToMenu } from "../../src/core/world.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createRng } from "../../src/core/rng.js";

const config = DEFAULT_CONFIG;
const playArea = { width: 480, height: 640, groundY: 600, ceilingY: 0 };
const DT = 1 / 60;

const NO_INPUT = {
  flap: false,
  pointer: false,
  startKey: false,
  playPressed: false,
  highScoresPressed: false,
  backPressed: false,
  toggleBestScore: false,
  escape: false,
  togglePause: false,
  restart: false,
};
const input = (flags = {}) => ({ ...NO_INPUT, ...flags });

function world(state = "Playing", overrides = {}) {
  return { ...createInitialWorld(config, playArea, 0, createRng(7)), state, ...overrides };
}

/** A pipe pair far to the right with a Gap around the Ghost. */
const pipe = (overrides = {}) => ({ id: 0, x: 400, width: 60, gapY: 240, gapHeight: 160, scored: false, ...overrides });

const types = (effects) => effects.map((e) => e.type);

describe("stepWorld: Playing", () => {
  it("Enter (startKey only) does not flap: vy changes by gravity only", () => {
    const w = world("Playing", { ghost: { ...world().ghost, vy: 100 } });
    const { world: next, effects } = stepWorld(w, input({ startKey: true }), DT, config);
    expect(next.ghost.vy).toBeCloseTo(100 + config.physics.gravity * DT, 10);
    expect(types(effects)).not.toContain("FlapApplied");
    expect(effects).not.toContainEqual({ type: "PlaySound", sound: "jump" });
    expect(next.state).toBe("Playing");
  });

  it("an applied Flap sets vy from config and emits FlapApplied and PlaySound jump", () => {
    const w = world("Playing", { ghost: { ...world().ghost, vy: 600 } });
    const { world: next, effects } = stepWorld(w, input({ flap: true }), DT, config);
    expect(next.ghost.vy).toBeCloseTo(config.physics.flapVelocity + config.physics.gravity * DT, 10);
    expect(next.ghost.x).toBe(w.ghost.x);
    expect(effects).toEqual([{ type: "FlapApplied" }, { type: "PlaySound", sound: "jump" }]);
  });

  it("uses the config passed on each call", () => {
    const w = world("Playing");
    const heavy = { ...config, physics: { ...config.physics, gravity: 3000 } };
    const { world: next } = stepWorld(w, input(), DT, heavy);
    expect(next.ghost.vy).toBeCloseTo(3000 * DT, 10);
  });

  it("togglePause goes to Paused with no other change, even with flap in the same frame", () => {
    const w = world("Playing", { pipes: [pipe()] });
    const { world: next, effects } = stepWorld(w, input({ togglePause: true, flap: true }), DT, config);
    expect(next).toEqual({ ...w, state: "Paused" });
    expect(effects).toEqual([{ type: "StateEntered", state: "Paused" }]);
  });

  it("spawns a pipe, bumps nextPipeId, and scrolls pipes and clouds at pipeSpeed", () => {
    const w = world("Playing");
    const { world: next } = stepWorld(w, input(), DT, config);
    expect(next.pipes).toHaveLength(1);
    expect(next.pipes[0].x).toBeCloseTo(playArea.width - w.pipeSpeed * DT, 10);
    expect(next.nextPipeId).toBe(next.pipes[0].id + 1);
    expect(next.rng).not.toBe(w.rng);
    // A layer-0 cloud moves by ratio * pipeSpeed * dt (unless it wrapped).
    const c0 = w.clouds.find((c) => c.layer === 0);
    const c1 = next.clouds[w.clouds.indexOf(c0)];
    expect(c1.x).toBeCloseTo(c0.x - config.cloudLayerSpeedRatios[0] * w.pipeSpeed * DT, 10);
  });

  it("scores a passed pair exactly once and applies difficulty on the same frame", () => {
    const g = world().ghost;
    const passedPipe = pipe({ id: 3, x: g.x - 61 }); // trailing edge just left of the Ghost
    const w = world("Playing", { pipes: [passedPipe, pipe({ id: 4, x: 420 })], score: 4, nextPipeId: 5 });
    const first = stepWorld(w, input(), DT, config).world;
    expect(first.score).toBe(5);
    expect(first.pipes.find((p) => p.id === 3).scored).toBe(true);
    expect(first.passed.has(3)).toBe(true);
    // Score 5 crosses the first threshold: pipes scroll at the new speed this frame.
    const newSpeed = config.basePipeSpeed + config.speedStep;
    expect(first.pipeSpeed).toBe(newSpeed);
    expect(first.speedTier).toBe(1);
    expect(first.pipes.find((p) => p.id === 4).x).toBeCloseTo(420 - newSpeed * DT, 10);

    const second = stepWorld(first, input(), DT, config).world;
    expect(second.score).toBe(5);
  });

  it("collision goes to Game_Over, raises the high score, and persists it", () => {
    const w = world("Playing", { ghost: { ...world().ghost, y: 595 }, score: 8, highScore: 3 });
    const { world: next, effects } = stepWorld(w, input(), DT, config);
    expect(next.state).toBe("Game_Over");
    expect(next.highScore).toBe(8);
    expect(effects).toContainEqual({ type: "PlaySound", sound: "gameOver" });
    expect(effects).toContainEqual({ type: "StateEntered", state: "Game_Over" });
    expect(effects).toContainEqual({ type: "PersistHighScore", value: 8 });
  });

  it("collision without a new high score keeps it and does not persist", () => {
    const w = world("Playing", { ghost: { ...world().ghost, y: 595 }, score: 2, highScore: 9 });
    const { world: next, effects } = stepWorld(w, input(), DT, config);
    expect(next.state).toBe("Game_Over");
    expect(next.highScore).toBe(9);
    expect(types(effects)).not.toContain("PersistHighScore");
  });

  it("detects a pipe collision after this frame's movement", () => {
    const g = world().ghost;
    // Top pipe rect covers the Ghost after scrolling.
    const w = world("Playing", { pipes: [pipe({ x: g.x - 10, gapY: 500 })], nextPipeId: 1 });
    expect(stepWorld(w, input(), DT, config).world.state).toBe("Game_Over");
  });

  it("does not mutate its inputs", () => {
    const w = world("Playing", { pipes: [pipe({ x: world().ghost.x - 61 })], nextPipeId: 1 });
    const { rng: _r, ...plain } = w;
    const snapshot = structuredClone(plain);
    const inp = input({ flap: true });
    stepWorld(w, inp, DT, config);
    const { rng: _r2, ...after } = w;
    expect(after).toEqual(snapshot);
    expect(inp).toEqual(input({ flap: true }));
  });
});

describe("stepWorld: Paused", () => {
  it("ignores flap and dt and never collides", () => {
    const w = world("Paused", { ghost: { ...world().ghost, y: 595 }, pipes: [pipe()] });
    const { world: next, effects } = stepWorld(w, input({ flap: true, pointer: true, startKey: true }), 0.03, config);
    expect(next).toEqual(w);
    expect(effects).toEqual([]);
  });

  it("togglePause returns to Playing and emits StateEntered Playing", () => {
    const w = world("Paused", { pipes: [pipe()] });
    const { world: next, effects } = stepWorld(w, input({ togglePause: true }), DT, config);
    expect(next).toEqual({ ...w, state: "Playing" });
    expect(effects).toEqual([{ type: "StateEntered", state: "Playing" }]);
  });

  it("pause then resume round-trips the world", () => {
    const w = world("Playing", { pipes: [pipe()], score: 2 });
    const paused = stepWorld(w, input({ togglePause: true }), DT, config).world;
    const resumed = stepWorld(paused, input({ togglePause: true }), DT, config).world;
    expect(resumed).toEqual(w);
  });
});

describe("stepWorld: Game_Over", () => {
  it("freezes the world without restart input", () => {
    const w = world("Game_Over", { ghost: { ...world().ghost, y: 595 }, pipes: [pipe()] });
    const { world: next, effects } = stepWorld(w, input({ flap: true, togglePause: true }), 0.03, config);
    expect(next).toEqual(w);
    expect(effects).toEqual([]);
  });

  for (const flag of ["pointer", "startKey", "restart"]) {
    it(`${flag} resets to Main_Menu with the panel closed`, () => {
      const w = world("Game_Over", {
        pipes: [pipe()],
        score: 6,
        highScore: 6,
        menu: { bestScoreOpen: true },
      });
      const { world: next, effects } = stepWorld(w, input({ [flag]: true }), DT, config);
      expect(next).toEqual(resetToMenu(w, config));
      expect(next.state).toBe("Main_Menu");
      expect(next.pipes).toEqual([]);
      expect(next.score).toBe(0);
      expect(next.ghost.vy).toBe(0);
      expect(next.menu.bestScoreOpen).toBe(false);
      expect(next.highScore).toBe(6);
      expect(effects).toEqual([{ type: "StateEntered", state: "Main_Menu" }]);
    });
  }
});

describe("stepWorld: flap and transition effects across a session", () => {
  const stateEntered = (effects) => effects.filter((e) => e.type === "StateEntered");
  const jumps = (effects) => effects.filter((e) => e.type === "PlaySound" && e.sound === "jump");
  const flapsApplied = (effects) => effects.filter((e) => e.type === "FlapApplied");

  it("each consecutive in-Playing Flap emits exactly one FlapApplied and one PlaySound jump", () => {
    let w = world("Playing");
    for (let i = 0; i < 3; i++) {
      const { world: next, effects } = stepWorld(w, input({ flap: true }), DT, config);
      expect(next.state).toBe("Playing");
      expect(flapsApplied(effects)).toHaveLength(1);
      expect(jumps(effects)).toHaveLength(1);
      expect(stateEntered(effects)).toEqual([]);
      w = next;
    }
  });

  it("Main_Menu → Playing → Paused → Playing → Game_Over → Main_Menu emits one matching StateEntered per transition", () => {
    const observed = [];
    const step = (w, flags) => {
      const { world: next, effects } = stepWorld(w, input(flags), DT, config);
      observed.push(stateEntered(effects));
      return { next, effects };
    };

    let { next: w, effects } = step(world("Main_Menu"), { startKey: true });
    expect(w.state).toBe("Playing");
    expect(flapsApplied(effects)).toHaveLength(1);
    expect(jumps(effects)).toHaveLength(1);

    ({ next: w } = step(w, { togglePause: true }));
    expect(w.state).toBe("Paused");

    ({ next: w } = step(w, { togglePause: true }));
    expect(w.state).toBe("Playing");

    // Place the Ghost on the Ground at rest (clearing the start Flap's upward vy) so the next step collides.
    ({ next: w } = step({ ...w, ghost: { ...w.ghost, y: playArea.groundY - 5, vy: 0 } }, {}));
    expect(w.state).toBe("Game_Over");

    ({ next: w } = step(w, { restart: true }));
    expect(w.state).toBe("Main_Menu");

    expect(observed).toEqual(
      ["Playing", "Paused", "Playing", "Game_Over", "Main_Menu"].map((state) => [{ type: "StateEntered", state }]),
    );
  });
});

describe("stepWorld: Main_Menu", () => {
  const openMenu = (overrides = {}) => world("Main_Menu", { menu: { bestScoreOpen: true }, ...overrides });

  it("returns the world unchanged with no effects on no input", () => {
    const w = world("Main_Menu");
    const { world: next, effects } = stepWorld(w, input(), DT, config);
    expect(next).toEqual(w);
    expect(effects).toEqual([]);
  });

  // How the controller reports each physical start input (design InputController).
  const starts = {
    Space: { startKey: true, flap: true },
    Enter: { startKey: true },
    "click/tap": { pointer: true, flap: true },
    "Play button": { playPressed: true },
  };
  for (const [name, flags] of Object.entries(starts)) {
    it(`${name} starts Playing with score 0, base speed, and the first Flap`, () => {
      const w = world("Main_Menu", { score: 3, pipeSpeed: 999, speedTier: 4 });
      const { world: next, effects } = stepWorld(w, input(flags), DT, config);
      expect(next.state).toBe("Playing");
      expect(next.score).toBe(0);
      expect(next.pipeSpeed).toBe(config.basePipeSpeed);
      expect(next.speedTier).toBe(0);
      expect(next.pipes).toEqual([]);
      expect(next.passed.size).toBe(0);
      // Only the Flap is applied this frame: no gravity integration, x and y unchanged.
      expect(next.ghost).toEqual({ ...w.ghost, vy: config.physics.flapVelocity });
      expect(next.clouds).toEqual(w.clouds);
      expect(effects).toEqual([
        { type: "FlapApplied" },
        { type: "PlaySound", sound: "jump" },
        { type: "StateEntered", state: "Playing" },
      ]);
    });
  }

  it("flap alone (not a start input) does nothing", () => {
    const w = world("Main_Menu");
    const { world: next, effects } = stepWorld(w, input({ flap: true }), DT, config);
    expect(next).toEqual(w);
    expect(effects).toEqual([]);
  });

  for (const flag of ["highScoresPressed", "toggleBestScore"]) {
    it(`${flag} opens the panel without starting or flapping`, () => {
      const w = world("Main_Menu");
      const { world: next, effects } = stepWorld(w, input({ [flag]: true }), DT, config);
      expect(next).toEqual({ ...w, menu: { bestScoreOpen: true } });
      expect(effects).toEqual([]);
    });

    it(`${flag} wins over start inputs in the same frame`, () => {
      const w = world("Main_Menu");
      const all = { [flag]: true, startKey: true, flap: true, pointer: true, playPressed: true };
      const { world: next, effects } = stepWorld(w, input(all), DT, config);
      expect(next.state).toBe("Main_Menu");
      expect(next.menu.bestScoreOpen).toBe(true);
      expect(next.ghost).toEqual(w.ghost);
      expect(effects).toEqual([]);
    });
  }

  for (const flag of ["backPressed", "escape", "toggleBestScore"]) {
    it(`${flag} closes the open panel without starting, even with start inputs`, () => {
      const w = openMenu();
      const { world: next, effects } = stepWorld(
        w,
        input({ [flag]: true, startKey: true, pointer: true, flap: true }),
        DT,
        config,
      );
      expect(next).toEqual({ ...w, menu: { bestScoreOpen: false } });
      expect(effects).toEqual([]);
    });
  }

  it("ignores every other input while the panel is open", () => {
    const w = openMenu();
    const others = input({
      flap: true,
      pointer: true,
      startKey: true,
      playPressed: true,
      highScoresPressed: true,
      togglePause: true,
      restart: true,
    });
    const { world: next, effects } = stepWorld(w, others, DT, config);
    expect(next).toBe(w);
    expect(effects).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const w = world("Main_Menu");
    const { rng: _r, ...plain } = w;
    const snapshot = structuredClone(plain);
    stepWorld(w, input({ startKey: true, flap: true }), DT, config);
    stepWorld(w, input({ toggleBestScore: true }), DT, config);
    const { rng: _r2, ...after } = w;
    expect(after).toEqual(snapshot);
  });
});
