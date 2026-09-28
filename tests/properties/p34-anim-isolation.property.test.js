// Feature: flappy-kiro, Property 34: For any initial world, config, and sequence of (InputFrame, dt) pairs, the sequence of worlds and effects produced by stepWorld alone is identical to the sequence produced when stepAnimation and frameVisual are also run after every step, with either value of reducedMotion. In particular the Ghost position, velocity, and ghostHitbox are identical on every frame.
// **Validates: Requirements 19.4, 20.9**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { stepWorld } from "../../src/core/step.js";
import { stepAnimation, frameVisual, initialAnimState } from "../../src/core/animation.js";
import { ghostHitbox } from "../../src/core/collision.js";
import { worldArb, dtArb, inputFrameArb } from "../arbitraries/world.js";
import { animStateArb } from "../arbitraries/anim.js";

/** The rng holds its state in a closure, so identify it by its next few draws. */
function rngFingerprint(rng) {
  const out = [];
  let r = rng;
  for (let i = 0; i < 3; i++) {
    const d = r.next();
    out.push(d.value);
    r = d.rng;
  }
  return out;
}

/** Deep-comparable snapshot of a World (structuredClone keeps the Set; rng replaced by its fingerprint). */
function snapshotWorld(world) {
  const { rng, ...rest } = world;
  return { ...structuredClone(rest), rng: rngFingerprint(rng) };
}

const scriptArb = fc.array(fc.tuple(inputFrameArb, dtArb), { minLength: 1, maxLength: 60 });
const startAnimArb = fc.oneof(fc.constant(initialAnimState()), animStateArb);

describe("Animation isolation", () => {
  it("Property 34: interleaving stepAnimation/frameVisual never changes worlds, effects, or the Hitbox", () => {
    fc.assert(
      fc.property(worldArb(), scriptArb, startAnimArb, fc.boolean(), ({ world: w0, config }, script, anim0, reducedMotion) => {
        let plain = w0;
        let animated = w0;
        let anim = anim0;

        for (const [input, dt] of script) {
          const a = stepWorld(plain, input, dt, config);
          const b = stepWorld(animated, input, dt, config);

          // Snapshot what stepAnimation receives, then run the presentation layer.
          const worldBefore = snapshotWorld(b.world);
          const effectsBefore = structuredClone(b.effects);
          anim = stepAnimation(anim, b.effects, dt * 1000, b.world, config, reducedMotion);
          frameVisual(anim, reducedMotion);

          // stepAnimation/frameVisual do not mutate the world or effects they read.
          expect(snapshotWorld(b.world)).toEqual(worldBefore);
          expect(b.effects).toEqual(effectsBefore);

          // Worlds and effects are identical with and without animation (R20.9).
          expect(snapshotWorld(b.world)).toEqual(snapshotWorld(a.world));
          expect(b.effects).toEqual(a.effects);
          // Ghost position, velocity, and Hitbox are identical on every frame (R19.4).
          expect(b.world.ghost).toEqual(a.world.ghost);
          expect(ghostHitbox(b.world.ghost, config)).toEqual(ghostHitbox(a.world.ghost, config));

          plain = a.world;
          animated = b.world;
        }
      }),
      { numRuns: 100 },
    );
  });
});
