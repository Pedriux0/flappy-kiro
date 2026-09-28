// Feature: flappy-kiro, Property 22: For any list of PlaySound effects, when the AudioManager is muted, applying those effects invokes no audio playback.
// **Validates: Requirements 13.5**
//
// Stronger form checked here: across any interleaving of apply(effects) and
// setMuted(toggle) operations, the total play() count equals the number of
// valid PlaySound effects applied while unmuted, and every apply() made while
// muted adds zero plays.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createAudioManager } from "../../src/shell/audioManager.js";

const PATHS = { jump: "assets/jump.wav", gameOver: "assets/game_over.wav" };

/** Mock createAudio: each element counts its own play() calls. */
function makeAudioFactory() {
  const created = [];
  const createAudio = (src) => {
    const audio = {
      src,
      currentTime: 0,
      plays: 0,
      addEventListener() {},
      play() {
        audio.plays += 1;
        return Promise.resolve();
      },
    };
    created.push(audio);
    return audio;
  };
  const totalPlays = () => created.reduce((n, a) => n + a.plays, 0);
  return { createAudio, totalPlays };
}

const playSoundArb = fc.record({
  type: fc.constant("PlaySound"),
  sound: fc.constantFrom("jump", "gameOver"),
});
const otherEffectArb = fc.oneof(
  fc.record({ type: fc.constant("FlapApplied") }),
  fc.record({ type: fc.constant("StateEntered"), state: fc.constantFrom("Main_Menu", "Playing", "Paused", "Game_Over") }),
  fc.record({ type: fc.constant("PlaySound"), sound: fc.constantFrom("unknown", "") }),
);
const effectArb = fc.oneof({ weight: 3, arbitrary: playSoundArb }, { weight: 1, arbitrary: otherEffectArb });

const opArb = fc.oneof(
  { weight: 3, arbitrary: fc.array(effectArb, { maxLength: 6 }).map((effects) => ({ op: "apply", effects })) },
  { weight: 1, arbitrary: fc.boolean().map((muted) => ({ op: "setMuted", muted })) },
);

const countPlayable = (effects) =>
  effects.filter((e) => e.type === "PlaySound" && (e.sound === "jump" || e.sound === "gameOver")).length;

describe("Muting suppresses sound playback", () => {
  it("Property 22: plays equal PlaySound effects applied while unmuted; zero while muted", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.array(opArb, { maxLength: 30 }), (startMuted, ops) => {
        const { createAudio, totalPlays } = makeAudioFactory();
        const audio = createAudioManager({ createAudio, paths: PATHS });
        audio.setMuted(startMuted);
        let muted = startMuted;
        let expected = 0;

        for (const op of ops) {
          if (op.op === "setMuted") {
            audio.setMuted(op.muted);
            muted = op.muted;
            expect(audio.isMuted()).toBe(muted);
            continue;
          }
          const before = totalPlays();
          audio.apply(op.effects);
          const added = totalPlays() - before;
          const want = muted ? 0 : countPlayable(op.effects);
          expect(added).toBe(want);
          expected += want;
        }
        expect(totalPlays()).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });

  it("Property 22: a muted manager never plays for any list of PlaySound effects", () => {
    fc.assert(
      fc.property(fc.array(playSoundArb, { maxLength: 20 }), (effects) => {
        const { createAudio, totalPlays } = makeAudioFactory();
        const audio = createAudioManager({ createAudio, paths: PATHS });
        audio.setMuted(true);
        audio.apply(effects);
        expect(totalPlays()).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
