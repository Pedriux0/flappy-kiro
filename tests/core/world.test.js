import { describe, it, expect } from "vitest";
import { createInitialWorld, resetToMenu } from "../../src/core/world.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createRng } from "../../src/core/rng.js";

const config = DEFAULT_CONFIG;
const playArea = { width: 480, height: 640, groundY: 600, ceilingY: 0 };

describe("createInitialWorld", () => {
  it("builds a Main_Menu world with the Ghost at its start position", () => {
    const w = createInitialWorld(config, playArea, 7, createRng(42));
    expect(w.state).toBe("Main_Menu");
    expect(w.ghost).toEqual({
      x: config.ghostStartXRatio * 480,
      y: config.ghostStartYRatio * 640,
      vy: 0,
      width: config.ghostWidth,
      height: config.ghostHeight,
    });
    expect(w.pipes).toEqual([]);
    expect(w.clouds).toHaveLength(config.cloudCount);
    expect(w.score).toBe(0);
    expect(w.highScore).toBe(7);
    expect(w.pipeSpeed).toBe(config.basePipeSpeed);
    expect(w.speedTier).toBe(0);
    expect(w.muted).toBe(false);
    expect(w.menu).toEqual({ bestScoreOpen: false });
    expect(w.playArea).toEqual(playArea);
    expect(w.passed).toEqual(new Set());
    expect(w.nextPipeId).toBe(0);
  });

  it("copies no tuning values into World", () => {
    const w = createInitialWorld(config, playArea, 0, createRng(1));
    for (const key of ["physics", "gapHeight", "spawnDistance", "cloudLayerSpeedRatios", "ghostHitboxRadius"]) {
      expect(w).not.toHaveProperty(key);
    }
  });

  // Task 6.2: explicit examples for R1.1, R1.3, R1.5, R12.3, R15.1, R18.9.
  it("places the Ghost at (144, 320) in a 480x640 play area (R1.3)", () => {
    const w = createInitialWorld(config, playArea, 0, createRng(1));
    expect(w.ghost.x).toBeCloseTo(144, 10);
    expect(w.ghost.y).toBeCloseTo(320, 10);
    expect(w.ghost.vy).toBe(0);
  });

  it("scales the Ghost start with the play area (30% w, 50% h)", () => {
    const area = { width: 800, height: 600, groundY: 560, ceilingY: 0 };
    const w = createInitialWorld(config, area, 0, createRng(1));
    expect(w.ghost.x).toBeCloseTo(240, 10);
    expect(w.ghost.y).toBeCloseTo(300, 10);
  });

  it("starts with score 0 and pipeSpeed = basePipeSpeed regardless of highScore (R1.5, R15.1)", () => {
    const custom = { ...config, basePipeSpeed: 220 };
    const w = createInitialWorld(custom, playArea, 99, createRng(3));
    expect(w.state).toBe("Main_Menu");
    expect(w.score).toBe(0);
    expect(w.pipeSpeed).toBe(220);
    expect(w.menu.bestScoreOpen).toBe(false);
  });

  it.each([1, 3, 10])("seeds config.cloudCount clouds (cloudCount = %i) (R12.3)", (cloudCount) => {
    const w = createInitialWorld({ ...config, cloudCount }, playArea, 0, createRng(11));
    expect(w.clouds).toHaveLength(cloudCount);
  });

  it("is deterministic for a seed", () => {
    const a = createInitialWorld(config, playArea, 0, createRng(9));
    const b = createInitialWorld(config, playArea, 0, createRng(9));
    expect(a.clouds).toEqual(b.clouds);
  });
});

describe("resetToMenu", () => {
  it("restores the start state while keeping highScore, rng, clouds, muted", () => {
    const init = createInitialWorld(config, playArea, 3, createRng(5));
    const played = {
      ...init,
      state: "Game_Over",
      ghost: { ...init.ghost, y: 590, vy: 700 },
      pipes: [{ id: 4, x: 100, width: 60, gapY: 200, gapHeight: 150, scored: true }],
      score: 12,
      highScore: 12,
      pipeSpeed: config.basePipeSpeed + 50,
      speedTier: 2,
      muted: true,
      menu: { bestScoreOpen: true },
      passed: new Set([4]),
      nextPipeId: 5,
    };
    const { rng: _rng, ...plain } = played;
    const snapshot = structuredClone(plain);
    const r = resetToMenu(played, config);

    expect(r.state).toBe("Main_Menu");
    expect(r.ghost).toEqual(init.ghost);
    expect(r.pipes).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.pipeSpeed).toBe(config.basePipeSpeed);
    expect(r.speedTier).toBe(0);
    expect(r.menu.bestScoreOpen).toBe(false);
    expect(r.passed.size).toBe(0);
    expect(r.highScore).toBe(12);
    expect(r.rng).toBe(played.rng);
    expect(r.clouds).toBe(played.clouds);
    expect(r.muted).toBe(true);
    expect(r.nextPipeId).toBe(5);
    // input not mutated
    const { rng: _rng2, ...after } = played;
    expect(after).toEqual(snapshot);
  });
});
