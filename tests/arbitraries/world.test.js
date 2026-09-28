import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { checkCollisions } from "../../src/core/collision.js";
import { stepWorld } from "../../src/core/step.js";
import {
  MAX_DT,
  GAME_STATES,
  INPUT_FLAGS,
  NO_INPUT,
  COLLISION_KINDS,
  CONTACT_KINDS,
  dtArb,
  ghostArb,
  pipesArb,
  playAreaArb,
  worldArb,
  safeWorldArb,
  collidingWorldArb,
  exactContactWorldArb,
  inputFrameArb,
  referenceCollides,
  hitboxHitsPipe,
} from "./world.js";
import { validConfigArb } from "./config.js";

const RUNS = { numRuns: 200 };

/** Structural invariants every generated world must satisfy. */
function expectWellFormed(world, config) {
  const { playArea: a, ghost, pipes } = world;
  expect(GAME_STATES).toContain(world.state);
  expect(a.ceilingY).toBeLessThan(a.groundY);
  expect(a.groundY).toBeLessThanOrEqual(a.height);
  expect(ghost.width).toBe(config.ghostWidth);
  expect(ghost.height).toBe(config.ghostHeight);
  expect(ghost.x).toBeGreaterThanOrEqual(config.ghostHitboxRadius);
  expect(ghost.x + config.ghostHitboxRadius).toBeLessThan(a.width);
  expect(Number.isFinite(ghost.y) && Number.isFinite(ghost.vy)).toBe(true);
  const ids = pipes.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (let i = 1; i < pipes.length; i++) {
    expect(pipes[i].id).toBeGreaterThan(pipes[i - 1].id);
    expect(pipes[i].x).toBeGreaterThanOrEqual(pipes[i - 1].x);
  }
  for (const p of pipes) {
    expect(Number.isInteger(p.id) && p.id < world.nextPipeId).toBe(true);
    expect(p.gapY).toBeGreaterThanOrEqual(a.ceilingY);
    expect(p.gapY + p.gapHeight).toBeLessThanOrEqual(a.groundY);
    expect(p.width).toBe(config.pipeWidth);
    expect(p.scored).toBe(ghost.x > p.x + p.width);
    expect(world.passed.has(p.id)).toBe(p.scored);
  }
  if (pipes.length) expect(a.width - pipes[pipes.length - 1].x).toBeLessThan(config.spawnDistance);
  for (const id of world.passed) expect(id).toBeLessThan(world.nextPipeId);
  expect(world.score).toBe(world.passed.size);
  expect(world.pipeSpeed).toBeGreaterThanOrEqual(config.basePipeSpeed);
  expect(world.pipeSpeed).toBeLessThanOrEqual(config.maxPipeSpeed);
  expect(typeof world.menu.bestScoreOpen).toBe("boolean");
  expect(typeof world.rng.next).toBe("function");
  expect(world.clouds).toHaveLength(config.cloudCount);
}

describe("world arbitraries", () => {
  it("worldArb yields well-formed worlds in the requested state", () => {
    fc.assert(
      fc.property(fc.constantFrom(...GAME_STATES).chain((s) => worldArb(s).map((w) => ({ s, ...w }))), ({ s, world, config }) => {
        expect(world.state).toBe(s);
        expectWellFormed(world, config);
      }),
      RUNS,
    );
  });

  it("worldArb covers both panel states and every variant", () => {
    const seen = new Set();
    fc.assert(
      fc.property(worldArb(), ({ world, variant }) => {
        seen.add(`panel:${world.menu.bestScoreOpen}`);
        seen.add(`variant:${variant}`);
        seen.add(`state:${world.state}`);
      }),
      { numRuns: 400 },
    );
    for (const k of ["panel:true", "panel:false", "variant:any", "variant:safe", "variant:colliding", "variant:exactContact"]) {
      expect(seen).toContain(k);
    }
    for (const s of GAME_STATES) expect(seen).toContain(`state:${s}`);
  });

  it("safe worlds do not collide", () => {
    fc.assert(
      fc.property(safeWorldArb(), ({ world, config }) => {
        expectWellFormed(world, config);
        expect(checkCollisions(world.ghost, world.pipes, world.playArea, config)).toBe(false);
      }),
      RUNS,
    );
  });

  for (const kind of COLLISION_KINDS) {
    it(`colliding worlds (${kind}) collide, and only via ${kind}`, () => {
      fc.assert(
        fc.property(collidingWorldArb(undefined, kind), ({ world, config, kind: k }) => {
          expect(k).toBe(kind);
          expectWellFormed(world, config);
          const { ghost, pipes, playArea } = world;
          const r = config.ghostHitboxRadius;
          expect(checkCollisions(ghost, pipes, playArea, config)).toBe(true);
          expect(ghost.y + r > playArea.groundY).toBe(kind === "ground");
          expect(ghost.y - r < playArea.ceilingY).toBe(kind === "ceiling");
          expect(pipes.some((p) => hitboxHitsPipe(ghost, p, playArea, r))).toBe(kind === "pipe");
        }),
        RUNS,
      );
    });
  }

  for (const kind of CONTACT_KINDS) {
    it(`exact-contact worlds (${kind}) do not collide`, () => {
      fc.assert(
        fc.property(exactContactWorldArb(undefined, kind), ({ world, config }) => {
          expectWellFormed(world, config);
          const { ghost, playArea } = world;
          const r = config.ghostHitboxRadius;
          if (kind === "ground") expect(ghost.y + r).toBe(playArea.groundY);
          if (kind === "ceiling") expect(ghost.y - r).toBe(playArea.ceilingY);
          expect(checkCollisions(ghost, world.pipes, playArea, config)).toBe(false);
        }),
        RUNS,
      );
    });
  }

  it("Playing colliding / exact-contact worlds end / do not end the game with dt = 0 and no flap", () => {
    const arb = fc.oneof(collidingWorldArb("Playing"), exactContactWorldArb("Playing"));
    fc.assert(
      fc.property(arb, ({ world, config, variant }) => {
        const { world: next } = stepWorld(world, NO_INPUT, 0, config);
        expect(next.state).toBe(variant === "colliding" ? "Game_Over" : "Playing");
      }),
      RUNS,
    );
  });

  it("referenceCollides agrees with checkCollisions on arbitrary worlds", () => {
    fc.assert(
      fc.property(worldArb(undefined, { variant: "any" }), ({ world, config }) => {
        expect(referenceCollides(world.ghost, world.pipes, world.playArea, config.ghostHitboxRadius)).toBe(
          checkCollisions(world.ghost, world.pipes, world.playArea, config),
        );
      }),
      RUNS,
    );
  });

  it("ghostArb and pipesArb stay within the play area", () => {
    const arb = fc.tuple(validConfigArb, playAreaArb).chain(([config, area]) =>
      fc.record({
        config: fc.constant(config),
        area: fc.constant(area),
        free: ghostArb(config, area, "free"),
        pipes: pipesArb(config, area, { ghostX: 100 }),
      }),
    );
    fc.assert(
      fc.property(arb, ({ config, area, free, pipes }) => {
        const r = config.ghostHitboxRadius;
        expect(free.y - r).toBeGreaterThanOrEqual(area.ceilingY);
        expect(free.y + r).toBeLessThanOrEqual(area.groundY);
        const ids = pipes.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of pipes) {
          expect(p.gapY).toBeGreaterThanOrEqual(area.ceilingY);
          expect(p.gapY + p.gapHeight).toBeLessThanOrEqual(area.groundY);
          expect(p.scored).toBe(100 > p.x + p.width);
        }
      }),
      RUNS,
    );
  });

  it("dtArb is within [0, MAX_DT] and includes 0", () => {
    let sawZero = false;
    fc.assert(
      fc.property(dtArb, (dt) => {
        if (dt === 0) sawZero = true;
        expect(dt).toBeGreaterThanOrEqual(0);
        expect(dt).toBeLessThanOrEqual(MAX_DT);
      }),
      RUNS,
    );
    expect(sawZero).toBe(true);
  });

  it("inputFrameArb sets every flag as a boolean and produces start + panel combinations", () => {
    let sawCombo = false;
    fc.assert(
      fc.property(inputFrameArb, (frame) => {
        expect(Object.keys(frame).sort()).toEqual([...INPUT_FLAGS].sort());
        for (const f of INPUT_FLAGS) expect(typeof frame[f]).toBe("boolean");
        const start = frame.startKey || frame.playPressed || frame.pointer;
        const panel = frame.highScoresPressed || frame.toggleBestScore;
        if (start && panel) sawCombo = true;
      }),
      RUNS,
    );
    expect(sawCombo).toBe(true);
  });
});
