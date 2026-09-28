// Unit tests for the circular-Hitbox collision core (R8.1–8.3, R19.4, R19.6, R19.7).
import { describe, it, expect } from "vitest";
import {
  ghostHitbox,
  pipeRects,
  circleIntersectsRect,
  hitsGround,
  hitsCeiling,
  checkCollisions,
} from "../../src/core/collision.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const cfg = DEFAULT_CONFIG;
const R = cfg.ghostHitboxRadius;
const playArea = { width: 480, height: 640, groundY: 600, ceilingY: 40 };
// Gap spans y 200..350; pipe spans x 200..260.
const pipe = { id: 1, x: 200, width: 60, gapY: 200, gapHeight: 150, scored: false };
const ghostAt = (x, y) => ({ x, y, vy: 0, width: 32, height: 32 });

describe("ghostHitbox", () => {
  it("is centred on (ghost.x, ghost.y) with radius 12 under DEFAULT_CONFIG", () => {
    expect(R).toBe(12);
    expect(ghostHitbox(ghostAt(123.5, 321), cfg)).toEqual({ cx: 123.5, cy: 321, r: 12 });
  });

  it("does not depend on sprite width/height (R19.4)", () => {
    const a = ghostHitbox({ x: 10, y: 20, width: 32, height: 32 }, cfg);
    const b = ghostHitbox({ x: 10, y: 20, width: 200, height: 5 }, cfg);
    expect(a).toEqual(b);
  });
});

describe("pipeRects", () => {
  it("top spans ceilingY..gapY and bottom spans gapY+gapHeight..groundY", () => {
    const [top, bottom] = pipeRects(pipe, playArea);
    expect(top).toEqual({ x: 200, y: 40, width: 60, height: 160 });
    expect(bottom).toEqual({ x: 200, y: 350, width: 60, height: 250 });
  });
});

describe("checkCollisions", () => {
  it("Ghost inside the Gap does not collide (R8.1)", () => {
    expect(checkCollisions(ghostAt(230, 275), [pipe], playArea, cfg)).toBe(false);
  });

  it("Ghost overlapping the top pipe collides (R8.1)", () => {
    // Centre inside the gap column but hitbox reaches above gapY.
    expect(checkCollisions(ghostAt(230, 200 + R - 1), [pipe], playArea, cfg)).toBe(true);
  });

  it("Ghost overlapping the bottom pipe collides (R8.1)", () => {
    expect(checkCollisions(ghostAt(230, 350 - R + 1), [pipe], playArea, cfg)).toBe(true);
  });

  it("Ghost overlapping a pipe side from the left collides (R8.1)", () => {
    expect(checkCollisions(ghostAt(200 - R + 1, 100), [pipe], playArea, cfg)).toBe(true);
  });

  it("Ghost overlapping the Ground collides (R8.2)", () => {
    expect(checkCollisions(ghostAt(50, playArea.groundY - R + 0.5), [], playArea, cfg)).toBe(true);
  });

  it("Ghost overlapping the Ceiling collides (R8.3)", () => {
    expect(checkCollisions(ghostAt(50, playArea.ceilingY + R - 0.5), [], playArea, cfg)).toBe(true);
  });

  it("y + r == groundY does not collide (R19.6, R19.7)", () => {
    const ghost = ghostAt(50, playArea.groundY - R);
    expect(hitsGround(ghostHitbox(ghost, cfg), playArea)).toBe(false);
    expect(checkCollisions(ghost, [], playArea, cfg)).toBe(false);
  });

  it("y − r == ceilingY does not collide (R19.6, R19.7)", () => {
    const ghost = ghostAt(50, playArea.ceilingY + R);
    expect(hitsCeiling(ghostHitbox(ghost, cfg), playArea)).toBe(false);
    expect(checkCollisions(ghost, [], playArea, cfg)).toBe(false);
  });

  it("Ghost exactly touching a pipe edge does not collide (R19.7)", () => {
    expect(checkCollisions(ghostAt(230, 200 + R), [pipe], playArea, cfg)).toBe(false);
    expect(circleIntersectsRect({ cx: 200 - R, cy: 100, r: R }, pipeRects(pipe, playArea)[0])).toBe(false);
  });
});
