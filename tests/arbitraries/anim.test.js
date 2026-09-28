import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { FRAME_TABLES } from "../../src/core/animation.js";
import {
  MAX_DT_MS,
  FRAME_BOUNDARIES_MS,
  GAME_STATES,
  INFINITE_FRAME_ELAPSED_MAX,
  animStateArb,
  animEventsArb,
  dtMsSeqArb,
  boundaryDtMsSeqArb,
} from "./anim.js";

describe("animation arbitraries", () => {
  it("animStateArb yields valid states", () => {
    fc.assert(
      fc.property(animStateArb, (a) => {
        const frames = FRAME_TABLES[a.kind].frames;
        expect(Number.isInteger(a.frame) && a.frame >= 0 && a.frame < frames.length).toBe(true);
        const d = frames[a.frame].durationMs;
        expect(a.elapsedMs).toBeGreaterThanOrEqual(0);
        if (Number.isFinite(d)) expect(a.elapsedMs).toBeLessThan(d);
        else expect(a.elapsedMs).toBeLessThanOrEqual(INFINITE_FRAME_ELAPSED_MAX);
        expect(a.rotationDeg).toBeGreaterThanOrEqual(-20);
        expect(a.rotationDeg).toBeLessThanOrEqual(45);
        if (a.kind === "Death") expect(a.lockedRotationDeg).toBe(a.rotationDeg);
      }),
    );
  });

  it("animStateArb covers every kind", () => {
    const kinds = new Set(fc.sample(animStateArb, 500).map((a) => a.kind));
    expect([...kinds].sort()).toEqual(Object.keys(FRAME_TABLES).sort());
  });

  it("animEventsArb yields only FlapApplied and StateEntered", () => {
    fc.assert(
      fc.property(animEventsArb, (events) => {
        for (const e of events) {
          if (e.type === "StateEntered") expect(GAME_STATES).toContain(e.state);
          else expect(e).toEqual({ type: "FlapApplied" });
        }
      }),
    );
  });

  it("dtMsSeqArb stays within [0, MAX_DT_MS]", () => {
    fc.assert(
      fc.property(dtMsSeqArb, (seq) => {
        for (const dt of seq) {
          expect(dt).toBeGreaterThanOrEqual(0);
          expect(dt).toBeLessThanOrEqual(MAX_DT_MS);
        }
      }),
    );
  });

  it("boundaryDtMsSeqArb sums exactly to a frame boundary", () => {
    fc.assert(
      fc.property(boundaryDtMsSeqArb, (seq) => {
        expect(FRAME_BOUNDARIES_MS).toContain(seq.reduce((s, x) => s + x, 0));
      }),
    );
  });
});
