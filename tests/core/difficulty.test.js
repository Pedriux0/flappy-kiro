import { describe, it, expect } from "vitest";
import { targetPipeSpeed, applyDifficulty } from "../../src/core/difficulty.js";

// Explicit config so these tests don't depend on DEFAULT_CONFIG values.
const cfg = { basePipeSpeed: 160, maxPipeSpeed: 250, speedStep: 20, speedUpInterval: 5, gapHeight: 160 };

describe("targetPipeSpeed", () => {
  it("starts at basePipeSpeed (R15.1)", () => {
    expect(targetPipeSpeed(0, cfg)).toBe(160);
    expect(targetPipeSpeed(4, cfg)).toBe(160);
  });

  it("steps up by speedStep at each threshold (R15.2)", () => {
    expect(targetPipeSpeed(5, cfg)).toBe(180);
    expect(targetPipeSpeed(9, cfg)).toBe(180);
    expect(targetPipeSpeed(10, cfg)).toBe(200);
  });

  it("caps at maxPipeSpeed (R15.3, R15.4)", () => {
    expect(targetPipeSpeed(25, cfg)).toBe(250);
    expect(targetPipeSpeed(1000, cfg)).toBe(250);
  });
});

describe("applyDifficulty", () => {
  const world = { score: 12, pipeSpeed: 160, speedTier: 0, pipes: [{ id: 1, gapHeight: 140 }] };

  it("derives pipeSpeed and speedTier from score without mutating input", () => {
    const snapshot = structuredClone(world);
    const next = applyDifficulty(world, cfg);
    expect(next).not.toBe(world);
    expect(next.pipeSpeed).toBe(200);
    expect(next.speedTier).toBe(2);
    expect(world).toEqual(snapshot);
  });

  it("caps speedTier once the max speed is reached (R15.4)", () => {
    // (250 - 160) / 20 = 4.5 -> tier 5 is the first at the cap
    expect(applyDifficulty({ ...world, score: 1000 }, cfg).speedTier).toBe(5);
  });

  it("is idempotent and leaves pipe gaps untouched (R15.5, R15.7)", () => {
    const once = applyDifficulty(world, cfg);
    expect(applyDifficulty(once, cfg)).toEqual(once);
    expect(once.pipes).toBe(world.pipes);
  });
});
