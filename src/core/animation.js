// Pure, presentation-only Ghost animation (R20). The loop owns the AnimState;
// it is never stored in World, and stepAnimation only reads the world after
// stepWorld, so animation can never change the simulation (R20.9).
/**
 * @typedef {"Idle" | "Flap" | "Glide" | "Death"} AnimKind
 * @typedef {{ kind: AnimKind, frame: number, elapsedMs: number, rotationDeg: number, lockedRotationDeg?: number }} AnimState
 * @typedef {{ offsetX: number, offsetY: number, scaleX: number, scaleY: number, rotationDeg: number,
 *             opacity: number, eyes: "normal" | "cross", flash: boolean }} FrameVisual
 * @typedef {{ type: "FlapApplied" } | { type: "StateEntered", state: string } | { type: string }} Effect
 * @typedef {{ flapVelocity: number, terminalVelocity: number }} TiltPhysics
 */

/** Index of the Death hold frame shown after the shake finishes (R20.12). */
export const DEATH_HOLD_FRAME = 4;

const BASE = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, opacity: 1, eyes: "normal", flash: false };

/**
 * Frame tables (durations in ms). `Infinity` marks a frame that holds until an
 * event changes the kind. `next` is where a one-shot animation goes when its
 * last frame ends; looping kinds wrap to frame 0 instead.
 */
export const FRAME_TABLES = Object.freeze({
  Idle: {
    loop: true,
    frames: [
      { durationMs: 150, visual: { ...BASE, offsetY: 0 } },
      { durationMs: 150, visual: { ...BASE, offsetY: -2 } },
      { durationMs: 150, visual: { ...BASE, offsetY: 0 } },
      { durationMs: 150, visual: { ...BASE, offsetY: 2 } },
    ],
  },
  Flap: {
    loop: false,
    next: "Glide",
    frames: [
      { durationMs: 60, visual: { ...BASE, scaleX: 1.1, scaleY: 0.85 } }, // squash
      { durationMs: 60, visual: { ...BASE, scaleX: 0.9, scaleY: 1.1 } },  // stretch
      { durationMs: 80, visual: { ...BASE } },                            // settle
    ],
  },
  Glide: {
    loop: false,
    frames: [{ durationMs: Infinity, visual: { ...BASE } }],
  },
  Death: {
    loop: false,
    frames: [
      { durationMs: 80, visual: { ...BASE, flash: true } },                       // hit flash
      { durationMs: 120, visual: { ...BASE, eyes: "cross" } },                    // eyes cross
      { durationMs: 60, visual: { ...BASE, eyes: "cross", offsetX: 2 } },         // shake +
      { durationMs: 60, visual: { ...BASE, eyes: "cross", offsetX: -2 } },        // shake -
      { durationMs: Infinity, visual: { ...BASE, eyes: "cross", opacity: 0.7 } }, // hold
    ],
  },
});

/** @returns {AnimState} Idle frame 0, no elapsed time, rotation 0 (R20.1, R20.13). */
export function initialAnimState() {
  return { kind: "Idle", frame: 0, elapsedMs: 0, rotationDeg: 0 };
}

/**
 * Clamped linear tilt: −20° at flapVelocity to +45° at terminalVelocity (R20.5).
 * @param {number} vy
 * @param {TiltPhysics} physics
 * @returns {number} degrees in [−20, 45]
 */
export function velocityTilt(vy, physics) {
  const t = (vy - physics.flapVelocity) / (physics.terminalVelocity - physics.flapVelocity);
  return Math.min(45, Math.max(-20, -20 + 65 * t));
}

/**
 * Advance `anim` by `dtMs`, carrying overflow across frame boundaries.
 * @param {AnimState} anim
 * @param {number} dtMs
 * @returns {AnimState}
 */
function advance(anim, dtMs) {
  let { kind, frame } = anim;
  let elapsedMs = anim.elapsedMs + dtMs;
  for (;;) {
    const table = FRAME_TABLES[kind];
    const duration = table.frames[frame].durationMs;
    if (elapsedMs < duration) break;
    elapsedMs -= duration;
    if (frame + 1 < table.frames.length) {
      frame += 1;
    } else if (table.loop) {
      frame = 0;
    } else {
      // One-shot end: Flap → Glide frame 0. (Glide and Death hold are Infinity.)
      kind = table.next;
      frame = 0;
    }
  }
  return { ...anim, kind, frame, elapsedMs };
}

/**
 * Step the loop-owned animation by one rendered frame (R20.1–20.8, 20.12, 20.13).
 * Order: events, pause freeze, advance, rotation. `reducedMotion` never affects
 * timing (R20.10); it is accepted only to match the loop's call signature.
 * @param {AnimState} anim
 * @param {Effect[]} effects effects returned by stepWorld this frame
 * @param {number} dtMs same clamped delta as the simulation, in ms
 * @param {{ state: string, ghost: { vy: number } }} world world AFTER stepWorld (read-only)
 * @param {{ physics: TiltPhysics }} config
 * @param {boolean} _reducedMotion
 * @returns {AnimState}
 */
export function stepAnimation(anim, effects, dtMs, world, config, _reducedMotion) {
  let next = { ...anim };
  let reset = false;
  let enteredDeath = false;

  // 1. Events, in emission order. Resets do not consume dtMs this frame.
  for (const e of effects) {
    if (e.type === "StateEntered" && e.state === "Main_Menu") {
      next = initialAnimState();
      reset = true;
      enteredDeath = false;
    } else if (e.type === "StateEntered" && e.state === "Game_Over") {
      next = { kind: "Death", frame: 0, elapsedMs: 0, rotationDeg: next.rotationDeg, lockedRotationDeg: next.rotationDeg };
      reset = true;
      enteredDeath = true;
    } else if (e.type === "FlapApplied" && !enteredDeath) {
      // Restart from frame 0, discarding any remaining Flap time (R20.2, R20.3).
      next = { kind: "Flap", frame: 0, elapsedMs: 0, rotationDeg: next.rotationDeg };
      reset = true;
    }
  }

  // 2. Pause freeze: frame, elapsed time, and rotation stay as they are (R20.8).
  if (world.state === "Paused") return next;

  // 3. Advance with overflow carry.
  if (!reset) next = advance(next, Math.max(0, Number.isFinite(dtMs) ? dtMs : 0));

  // 4. Rotation.
  if (next.kind === "Idle") {
    next.rotationDeg = 0;
  } else if (next.kind === "Death") {
    next.rotationDeg = next.lockedRotationDeg ?? next.rotationDeg;
  } else {
    next.rotationDeg = velocityTilt(world.ghost.vy, config.physics);
  }
  return next;
}

/**
 * Map an AnimState to render parameters (R20.1, 20.2, 20.6, 20.10, 20.12).
 * Reduced motion zeroes the Idle bob and Death shake and drops the flash, but
 * keeps eyes, opacity, scale, and rotation.
 * @param {AnimState} anim
 * @param {boolean} reducedMotion
 * @returns {FrameVisual}
 */
export function frameVisual(anim, reducedMotion) {
  const frames = FRAME_TABLES[anim.kind].frames;
  const v = frames[Math.min(Math.max(0, anim.frame), frames.length - 1)].visual;
  const visual = { ...v, rotationDeg: anim.rotationDeg };
  if (reducedMotion) {
    visual.offsetX = 0;
    visual.offsetY = 0;
    visual.flash = false;
  }
  return visual;
}
