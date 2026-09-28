import { describe, it, expect } from "vitest";
import {
  initialAnimState,
  velocityTilt,
  stepAnimation,
  frameVisual,
  DEATH_HOLD_FRAME,
} from "../../src/core/animation.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const cfg = DEFAULT_CONFIG;
const world = (state, vy = 0) => ({ state, ghost: { vy } });
const FLAP = { type: "FlapApplied" };
const entered = (state) => ({ type: "StateEntered", state });

function run(anim, dts, w) {
  for (const dt of dts) anim = stepAnimation(anim, [], dt, w, cfg, false);
  return anim;
}

describe("velocityTilt", () => {
  it("maps flap velocity to -20, terminal to 45, and 0 to about +5.4", () => {
    expect(velocityTilt(-450, cfg.physics)).toBe(-20);
    expect(velocityTilt(700, cfg.physics)).toBe(45);
    expect(velocityTilt(0, cfg.physics)).toBeCloseTo(5.43, 1);
  });
  it("clamps outside the range", () => {
    expect(velocityTilt(-2000, cfg.physics)).toBe(-20);
    expect(velocityTilt(5000, cfg.physics)).toBe(45);
  });
});

describe("stepAnimation", () => {
  it("loops Idle through 4 frames of 150 ms with offsets [0,-2,0,2]", () => {
    const w = world("Main_Menu");
    const offsets = [];
    let a = initialAnimState();
    for (let i = 0; i < 8; i++) {
      offsets.push(frameVisual(a, false).offsetY);
      a = run(a, [150], w);
    }
    expect(offsets).toEqual([0, -2, 0, 2, 0, -2, 0, 2]);
    expect(a.rotationDeg).toBe(0);
  });

  it("FlapApplied starts Flap frame 0 without consuming dt, then goes to Glide at 200 ms", () => {
    const w = world("Playing", -450);
    let a = stepAnimation(initialAnimState(), [entered("Playing"), FLAP], 16, w, cfg, false);
    expect(a).toMatchObject({ kind: "Flap", frame: 0, elapsedMs: 0, rotationDeg: -20 });
    a = run(a, [59], w);
    expect(a.frame).toBe(0);
    a = run(a, [1], w);
    expect(a.frame).toBe(1);
    a = run(a, [100], w); // 160 total: frame 2 with 40 ms carried
    expect(a).toMatchObject({ kind: "Flap", frame: 2, elapsedMs: 40 });
    a = run(a, [45], w); // 205 total
    expect(a).toMatchObject({ kind: "Glide", frame: 0, elapsedMs: 5 });
  });

  it("a Flap mid-Flap restarts from frame 0", () => {
    const w = world("Playing");
    let a = stepAnimation(initialAnimState(), [FLAP], 0, w, cfg, false);
    a = run(a, [130], w);
    a = stepAnimation(a, [FLAP], 16, w, cfg, false);
    expect(a).toMatchObject({ kind: "Flap", frame: 0, elapsedMs: 0 });
  });

  it("Death runs flash, cross, shake +2, shake -2, then holds at 0.7 with locked rotation", () => {
    const glide = { kind: "Glide", frame: 0, elapsedMs: 0, rotationDeg: 17 };
    const w = world("Game_Over", 700);
    let a = stepAnimation(glide, [entered("Game_Over")], 16, w, cfg, false);
    expect(a).toMatchObject({ kind: "Death", frame: 0, elapsedMs: 0, rotationDeg: 17 });
    const seen = [];
    for (let t = 0; t < 400; t += 10) {
      const v = frameVisual(a, false);
      seen.push([t, v.flash, v.eyes, v.offsetX, v.opacity]);
      expect(a.rotationDeg).toBe(17);
      a = run(a, [10], w);
    }
    const at = (t) => seen.find((s) => s[0] === t).slice(1);
    expect(at(0)).toEqual([true, "normal", 0, 1]);
    expect(at(80)).toEqual([false, "cross", 0, 1]);
    expect(at(200)).toEqual([false, "cross", 2, 1]);
    expect(at(260)).toEqual([false, "cross", -2, 1]);
    expect(at(320)).toEqual([false, "cross", 0, 0.7]);
    expect(at(390)).toEqual([false, "cross", 0, 0.7]);
    expect(a.frame).toBe(DEATH_HOLD_FRAME);
    expect(seen.filter((s) => s[1]).length).toBe(8); // one contiguous 80 ms flash
  });

  it("freezes while Paused", () => {
    const a = { kind: "Flap", frame: 1, elapsedMs: 30, rotationDeg: 3 };
    expect(stepAnimation(a, [entered("Paused")], 50, world("Paused", 600), cfg, false)).toEqual(a);
    const resumed = stepAnimation(a, [entered("Playing")], 30, world("Playing"), cfg, false);
    expect(resumed).toMatchObject({ kind: "Flap", frame: 2, elapsedMs: 0 });
  });

  it("entering Main_Menu resets to Idle frame 0 with normal visuals", () => {
    const dead = { kind: "Death", frame: DEATH_HOLD_FRAME, elapsedMs: 500, rotationDeg: 30, lockedRotationDeg: 30 };
    const a = stepAnimation(dead, [entered("Main_Menu")], 16, world("Main_Menu"), cfg, false);
    expect(a).toEqual(initialAnimState());
    expect(frameVisual(a, false)).toMatchObject({ opacity: 1, eyes: "normal", flash: false, offsetX: 0, rotationDeg: 0 });
  });

  it("does not mutate its inputs", () => {
    const a = initialAnimState();
    const w = world("Playing", 100);
    const effects = [FLAP];
    stepAnimation(a, effects, 16, w, cfg, false);
    expect(a).toEqual(initialAnimState());
    expect(w).toEqual(world("Playing", 100));
    expect(effects).toEqual([FLAP]);
  });
});

describe("frameVisual with reducedMotion", () => {
  it("zeroes offsets and flash but keeps eyes, opacity, scale, rotation", () => {
    const cases = [
      { kind: "Idle", frame: 1, elapsedMs: 0, rotationDeg: 0 },
      { kind: "Death", frame: 0, elapsedMs: 0, rotationDeg: 9, lockedRotationDeg: 9 },
      { kind: "Death", frame: 2, elapsedMs: 0, rotationDeg: 9, lockedRotationDeg: 9 },
      { kind: "Death", frame: DEATH_HOLD_FRAME, elapsedMs: 0, rotationDeg: 9, lockedRotationDeg: 9 },
      { kind: "Flap", frame: 0, elapsedMs: 0, rotationDeg: -20 },
    ];
    for (const a of cases) {
      const full = frameVisual(a, false);
      const reduced = frameVisual(a, true);
      expect(reduced).toEqual({ ...full, offsetX: 0, offsetY: 0, flash: false });
    }
  });
});
