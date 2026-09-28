// @vitest-environment jsdom
// Feature: flappy-kiro, Property 5: For any number of raw flap events buffered within a single frame, draining them yields a single flap = true InputFrame, and stepping applies at most one Flap and emits at most one jump PlaySound effect for that frame.
// **Validates: Requirements 3.6**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createInputController } from "../../src/shell/inputController.js";
import { stepWorld } from "../../src/core/step.js";
import { safeWorldArb, dtArb } from "../arbitraries/world.js";

// Logical points that never hit a button visible while Playing (PAUSE spans
// x 420..468, y 12..60, so x ≤ 400 stays clear even with display-scale growth).
const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 400 }),
  y: fc.integer({ min: 0, max: 640 }),
});

const rawFlapArb = fc.oneof(
  pointArb.map((p) => ({ kind: "mousedown", ...p })),
  pointArb.map((p) => ({ kind: "touchstart", ...p })),
  fc.constant({ kind: "space" }),
);

function dispatch(target, ev) {
  if (ev.kind === "mousedown") {
    target.dispatchEvent(new MouseEvent("mousedown", { clientX: ev.x, clientY: ev.y, bubbles: true }));
  } else if (ev.kind === "touchstart") {
    const e = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "changedTouches", { value: [{ clientX: ev.x, clientY: ev.y }] });
    target.dispatchEvent(e);
  } else {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  }
}

describe("Single flap per frame", () => {
  it("Property 5: N buffered flap events in one frame apply exactly one Flap", () => {
    fc.assert(
      fc.property(
        safeWorldArb("Playing"),
        fc.array(rawFlapArb, { minLength: 1, maxLength: 20 }),
        dtArb,
        ({ world, config }, events, dt) => {
          const target = document.createElement("div");
          const controller = createInputController({
            target,
            keyTarget: target,
            getWorld: () => world,
            getDisplayScale: () => 1,
          });
          try {
            for (const ev of events) dispatch(target, ev);
            const frame = controller.drainInputBuffer();
            expect(frame.flap).toBe(true);

            const { world: next, effects } = stepWorld(world, frame, dt, config);
            expect(effects.filter((e) => e.type === "FlapApplied")).toHaveLength(1);
            expect(effects.filter((e) => e.type === "PlaySound" && e.sound === "jump")).toHaveLength(1);
            expect(next).toBeDefined();

            // The buffer is reset: a second drain in the same frame carries no flap.
            expect(controller.drainInputBuffer().flap).toBe(false);
          } finally {
            controller.dispose();
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
