# Implementation Plan: Flappy Kiro

## Overview

Build Flappy Kiro as `index.html` + vanilla JavaScript ES modules + one CSS file, rendered with Canvas 2D and no build step. Work proceeds from the inside out: project and test tooling first, then the `config` module every other module consumes, then the pure simulation core (RNG, physics, pipes, difficulty, clouds, circular-Hitbox collision, scoring, formatting, sprite fitting, world creation, and the `stepWorld` state machine with the Best_Score_Panel sub-state), then the pure presentation-only `animation` module, then the impure shell (constants and UI buttons, storage, audio, input, sprite preparation, rendering, reduced-motion detection, startup validation, and the loop), then the debug-only TuningPanel, and finally end-to-end wiring.

Layout used throughout:

- `index.html`, `styles.css` at the workspace root
- `src/core/*.js` for the pure core (no DOM access)
- `src/shell/*.js` for browser-facing modules, `src/main.js` for bootstrap
- `tests/core/`, `tests/shell/`, `tests/properties/`, `tests/integration/` for Vitest tests, `tests/arbitraries/` for shared fast-check generators

Tests run once with `npx vitest --run` (exposed as `npm test`). Property tests use fast-check with at least 100 runs each and carry the tag comment `// Feature: flappy-kiro, Property {number}: {property_text}`.

## Tasks

- [x] 1. Set up project structure and test tooling
  - [x] 1.1 Create `package.json`, `vitest.config.js`, and test folders
    - Create `package.json` (`"type": "module"`, `"private": true`) with a `"test": "vitest --run"` script
    - Add `vitest`, `fast-check`, and `jsdom` as devDependencies pinned to exact versions (install with `npm install --save-dev --save-exact`, no `^` or `~` ranges)
    - Create `vitest.config.js` with the default `node` environment and `include: ["tests/**/*.test.js"]`; jsdom tests opt in per file with `// @vitest-environment jsdom`
    - Create empty `tests/core/`, `tests/shell/`, `tests/properties/`, `tests/integration/`, `tests/arbitraries/` folders (with `.gitkeep` where needed)
    - Make sure `.gitignore` contains `node_modules/`
    - _Requirements: 16.1, 17.1 (test infrastructure supporting all requirements)_

  - [x] 1.2 Create `index.html`, `styles.css`, and the `src/` skeleton
    - `index.html`: a container element wrapping a `<canvas id="game">`, a `<script type="module" src="src/main.js">`, and a comment noting that ES modules must be served over a local static server (for example `python3 -m http.server` or `npx serve .`), not opened via `file://`
    - `styles.css`: centered canvas, light background, `image-rendering: pixelated`, container `position: relative` so overlays can be absolutely positioned
    - Create `src/core/` and `src/shell/` folders and a stub `src/main.js` that only locates the canvas
    - _Requirements: 1.1, 12.1, 12.3_

- [x] 2. Implement the config module
  - [x] 2.1 Create `src/core/config.js` with `DEFAULT_CONFIG`, `CONFIG_SCHEMA`, and a path getter
    - Export `DEFAULT_CONFIG` exactly as in the design (physics 1600 / −450 / 700, `speedUpInterval` 5, pipe, cloud, Ghost 32×32, `ghostHitboxRadius` 12, start ratios, and font values), with requirement-bound comments next to each value
    - Export `CONFIG_SCHEMA` with the 17 entries from the design, including `panel: true` for all R17.4 tunables and for `ghostHitboxRadius` (range 8–16)
    - Export `DEFAULT_HITBOX_RADIUS = 12` and `getConfigValue(config, key)` that reads a dotted key path (e.g. `"physics.gravity"`)
    - Module has no imports
    - _Requirements: 3.4, 12.1, 12.2, 12.3, 12.4, 12.6, 14.1, 14.2, 14.3, 15.2, 16.7, 17.4, 19.1, 19.4, 19.8_

  - [x] 2.2 Implement `validateConfig` and `clampToSchema` in `src/core/config.js`
    - `validateConfig(config, schema)` never throws and returns `ConfigWarning[]` with `key`, `value`, and a message that includes the allowed range or violated relation
    - Warn for each schema value that is out of range, missing, or non-finite; for `maxPipeSpeed < basePipeSpeed` (key naming both, value holding both); for each `cloudLayerSpeedRatios[i]` not strictly in (0, 1); for fewer than 2 distinct ratios; and for `ghostHitboxRadius > min(ghostWidth, ghostHeight) / 2`
    - Return `[]` when everything is valid; guard against missing or non-object inputs
    - `clampToSchema(key, value, schema)` returns `min(max(value, entry.min), entry.max)` and leaves in-range values unchanged
    - _Requirements: 12.7, 16.1, 16.2, 16.4, 16.5, 16.6, 17.6, 19.8_

  - [x] 2.3 Implement `resolveConfig` in `src/core/config.js`
    - `resolveConfig(config, schema)` calls `validateConfig`, returns `{ config, warnings }`, and never throws
    - Replace a missing, non-numeric, below-8, above-16, or above-half-sprite `ghostHitboxRadius` with `12`, with a warning whose `key` is `ghostHitboxRadius`, whose `value` is the rejected value, and whose message says it was replaced with 12
    - Leave every other field unchanged, including other invalid values (warn-only)
    - _Requirements: 16.3, 19.8, 19.10_

  - [x] 2.4 Implement `setConfigValue` and `serializeConfig` in `src/core/config.js`
    - `setConfigValue(config, key, value)` returns a new config, copying objects along the dotted path, never mutating the input
    - `serializeConfig(config)` returns `export const DEFAULT_CONFIG = { ... };` as a pasteable JS object literal with nested objects and arrays
    - _Requirements: 17.5, 17.7, 17.10_

  - [x] 2.5 Create config generators in `tests/arbitraries/config.js`
    - `validConfigArb`: draws each schema value from its `[min, max]` (integers where `step` is integral), enforces `maxPipeSpeed ≥ basePipeSpeed` and `cloudOpacityMin ≤ cloudOpacityMax`, draws at least two distinct ratios in (0, 1), and draws `ghostHitboxRadius` as an integer in `[8, min(16, floor(min(ghostWidth, ghostHeight) / 2))]`
    - `invalidConfigArb`: applies one mutation to a valid config (out-of-range value, `NaN`/`Infinity`, `maxPipeSpeed < basePipeSpeed`, a cloud ratio from {0, 1, negative, > 1}, or a radius of `undefined`, a string, `NaN`, 7, 17, or above half the sprite size) and returns `{ config, mutatedKeys }`
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 19.8, 19.10_

  - [x]* 2.6 Write unit tests for config defaults and helpers in `tests/core/config.test.js`
    - `DEFAULT_CONFIG` has gravity 1600, flapVelocity −450, terminalVelocity 700, speedUpInterval 5, `ghostWidth = ghostHeight = 32`, `ghostHitboxRadius = 12`
    - Every R17.4 tunable has a schema entry with `panel: true`
    - Ghost size, pipe width, cloud count, opacity range, font size, and Hitbox radius schema bounds match R12.1–12.4, R12.6, and R19.8
    - `setConfigValue` returns a new object and leaves the original unmutated
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 16.7, 17.4, 17.5, 19.4, 19.8_

  - [x]* 2.7 Write property test for valid configs in `tests/properties/p26-valid-config.property.test.js`
    - **Property 26: Valid configs produce no warnings**
    - Include `DEFAULT_CONFIG` as an explicit case
    - **Validates: Requirements 16.1, 16.6, 16.7**

  - [x]* 2.8 Write property test for invalid configs in `tests/properties/p27-invalid-config.property.test.js`
    - **Property 27: Invalid config values are reported by key and never throw**
    - Also assert `validateConfig` never throws for `fc.anything()` input
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 19.8**

  - [x]* 2.9 Write property test for clamping in `tests/properties/p28-clamp.property.test.js`
    - **Property 28: Clamping stays in range and preserves in-range values**
    - **Validates: Requirements 17.6**

  - [x]* 2.10 Write property test for serialization in `tests/properties/p29-serialize.property.test.js`
    - **Property 29: Config serialization round-trips**
    - Strip the `export const DEFAULT_CONFIG =` prefix and trailing `;`, evaluate the literal with `new Function("return (" + literal + ")")`, and compare with `toStrictEqual`
    - **Validates: Requirements 17.7**

  - [x]* 2.11 Write property test for `resolveConfig` in `tests/properties/p32-resolve-config.property.test.js`
    - **Property 32: Invalid Hitbox radius resolves to the default; other values are untouched**
    - Deep-compare every field except the radius; include a case with another invalid value that must stay unchanged and still be reported
    - **Validates: Requirements 16.3, 19.8, 19.10**

- [x] 3. Implement RNG and physics
  - [x] 3.1 Create `src/core/rng.js`
    - `createRng(seed)` returns an immutable `RNG` whose `next()` returns `{ value, rng }` with `value` in [0, 1) (e.g. mulberry32), with no shared mutable state
    - _Requirements: 6.4, 12.3_

  - [x] 3.2 Create `src/core/physics.js`
    - `applyFlap(ghost, flapVelocity)` returns a new Ghost with `vy = flapVelocity`
    - `integrate(ghost, dt, physicsCfg)` computes `vy' = min(vy + gravity·dt, terminalVelocity)`, `y' = y + vy'·dt`, leaves `x` unchanged
    - _Requirements: 3.4, 4.1, 4.2, 4.3, 4.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x]* 3.3 Write property test for flap in `tests/properties/p01-flap-velocity.property.test.js`
    - **Property 1: Flap sets a fixed velocity regardless of prior velocity**
    - **Validates: Requirements 3.4, 14.2**

  - [x]* 3.4 Write property test for integration in `tests/properties/p02-integration.property.test.js`
    - **Property 2: Single-step physics integration**
    - Compare within a small floating-point tolerance
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 14.1, 14.3, 14.4, 14.5**

  - [x]* 3.5 Write property test for frame-rate independence in `tests/properties/p03-frame-rate.property.test.js`
    - **Property 3: Frame-rate independence of motion**
    - Restrict generated ranges so the run stays entirely below or entirely at the terminal cap
    - **Validates: Requirements 12.5, 14.6**

- [x] 4. Implement pipes and difficulty
  - [x] 4.1 Create `src/core/pipes.js`
    - `scrollPipes(pipes, dt, speed)` moves every pair left by `speed·dt`
    - `cullPipes(pipes)` drops pairs with `x + width < 0`
    - `maybeSpawnPipe(pipes, world, config, rng)` spawns a new pair at the right edge when the rightmost pair is `config.spawnDistance` from the spawn edge (or no pipes exist), with a unique `id`, `width = config.pipeWidth`, `gapHeight = config.gapHeight`, `scored = false`, and `gapY` drawn from `rng` so the whole Gap fits between ceiling and ground; returns `{ pipes, rng }`
    - Existing pairs keep their own `gapHeight` when config changes
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 15.5, 15.7_

  - [x]* 4.2 Write property test for scrolling in `tests/properties/p09-pipe-scroll.property.test.js`
    - **Property 9: Pipes scroll left at the single current shared speed**
    - **Validates: Requirements 6.1, 15.5**

  - [x]* 4.3 Write property test for spawning in `tests/properties/p10-pipe-spawn.property.test.js`
    - **Property 10: New pipes spawn at fixed spacing with an in-bounds Gap**
    - Use `validConfigArb` and seeded RNGs; include a mid-run `gapHeight` change and assert existing pairs are untouched
    - **Validates: Requirements 6.2, 6.4**

  - [x]* 4.4 Write property test for culling in `tests/properties/p11-pipe-cull.property.test.js`
    - **Property 11: Off-screen pipes are culled, others retained**
    - **Validates: Requirements 6.5**

  - [x] 4.5 Create `src/core/difficulty.js`
    - `targetPipeSpeed(score, cfg)` returns `min(basePipeSpeed + floor(score / speedUpInterval)·speedStep, maxPipeSpeed)`
    - `applyDifficulty(world, cfg)` returns a new world with `pipeSpeed` and `speedTier` derived from `world.score`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

  - [x]* 4.6 Write property test for the speed formula in `tests/properties/p23-target-speed.property.test.js`
    - **Property 23: Pipe speed is a monotone, stepped, capped function of score**
    - Generate scores at 0, at exact `speedUpInterval` boundaries, and far beyond the cap
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

  - [x]* 4.7 Write property test for difficulty idempotence in `tests/properties/p24-apply-difficulty.property.test.js`
    - **Property 24: Applying difficulty is idempotent and yields one shared speed**
    - **Validates: Requirements 15.5**

- [x] 5. Implement clouds, collision, scoring, score formatting, and sprite fitting
  - [x] 5.1 Create `src/core/clouds.js`
    - `createClouds(config, playArea, rng)` generates `config.cloudCount` clouds spread over the layers in `cloudLayerSpeedRatios`, with opacity drawn in `[cloudOpacityMin, cloudOpacityMax]`; returns `{ clouds, rng }`
    - `layerSpeeds(pipeSpeed, ratios)` returns `ratio·pipeSpeed` per layer
    - `scrollClouds(clouds, dt, pipeSpeed, ratios)` moves each cloud by its layer speed and wraps it to the right edge after it leaves the left edge
    - _Requirements: 1.4, 12.3, 12.6, 12.7, 12.8, 15.6_

  - [x]* 5.2 Write property test for cloud opacity in `tests/properties/p19-cloud-opacity.property.test.js`
    - **Property 19: Cloud generation stays within opacity bounds**
    - **Validates: Requirements 12.6**

  - [x]* 5.3 Write property test for parallax layers in `tests/properties/p20-parallax.property.test.js`
    - **Property 20: Parallax layers are distinct and slower than the current pipe speed**
    - **Validates: Requirements 12.7, 12.8**

  - [x]* 5.4 Write property test for cloud speed bound in `tests/properties/p25-cloud-below-pipe.property.test.js`
    - **Property 25: Every cloud layer stays strictly below any reachable pipe speed**
    - **Validates: Requirements 15.6, 12.8**

  - [x] 5.5 Create `src/core/collision.js` with the circular Hitbox
    - `ghostHitbox(ghost, config)` returns `{ cx: ghost.x, cy: ghost.y, r: config.ghostHitboxRadius }`, independent of sprite size, animation, and canvas scaling
    - `pipeRects(pipe, playArea)` returns the top rect (`ceilingY..gapY`) and bottom rect (`gapY + gapHeight..groundY`)
    - `circleIntersectsRect(circle, rect)` clamps the centre to the rect and returns `dx² + dy² < r²` (strict, no square root; exact contact is not a hit)
    - `hitsGround(circle, playArea)` returns `cy + r > groundY`; `hitsCeiling(circle, playArea)` returns `cy − r < ceilingY`
    - `checkCollisions(ghost, pipes, playArea, config)` returns true on any pipe, Ground, or Ceiling hit
    - Do not add AABB helpers (`ghostBounds`, `intersects`); `Ghost.width`/`height` are for rendering only
    - _Requirements: 8.1, 8.2, 8.3, 19.4, 19.5, 19.6, 19.7_

  - [x]* 5.6 Write property test for circle-vs-rect in `tests/properties/p31-circle-rect.property.test.js`
    - **Property 31: Circle-vs-rect collision matches the geometric definition**
    - Compare with a `Math.hypot` brute-force reference using integer or dyadic coordinates; place boundary centres at exactly `r` beside an edge and assert false
    - **Validates: Requirements 8.1, 8.2, 8.3, 19.5, 19.6, 19.7**

  - [x]* 5.7 Write unit tests for collision in `tests/core/collision.test.js`
    - Ghost inside a Gap does not collide; overlapping top pipe, bottom pipe, Ground, and Ceiling each collide; `y + r == groundY` and `y − r == ceilingY` do not collide; `ghostHitbox` is centred on `(ghost.x, ghost.y)` with radius 12 under `DEFAULT_CONFIG`
    - _Requirements: 8.1, 8.2, 8.3, 19.4, 19.6, 19.7_

  - [x] 5.8 Create `src/core/scoring.js`
    - `updateScore(prev, next)` returns `{ score, passed }`, where `passed` is the `Set<PipeId>` of pairs already counted (pairs with `scored = true`) plus every pair whose trailing edge (`x + width`) the Ghost x has passed in `next` and that is not already counted; `score` adds one point per newly passed pair
    - `stepWorld` uses `passed` to set `scored = true` on those pairs, so each pair scores exactly once per session
    - _Requirements: 7.1, 7.2_

  - [x] 5.9 Create `src/core/format.js`
    - `formatScoreDisplay(score, highScore)` returns `"Score: N | High: M"` using non-negative integers
    - _Requirements: 1.5, 11.2, 11.3_

  - [x]* 5.10 Write property test for score display in `tests/properties/p18-score-display.property.test.js`
    - **Property 18: Score display round-trips non-negative integers**
    - **Validates: Requirements 11.2, 11.3**

  - [x] 5.11 Create `src/core/sprite.js`
    - `fitRect(srcW, srcH, cell)` uses `s = min(cell / srcW, cell / srcH)` and returns `{ x: (cell − w) / 2, y: (cell − h) / 2, width: w, height: h }` with `w = srcW·s`, `h = srcH·s` (about 26.3×32 for the 1290×1567 `ghosty.png`)
    - _Requirements: 19.2_

  - [x]* 5.12 Write property test for sprite fitting in `tests/properties/p33-fit-rect.property.test.js`
    - **Property 33: Sprite fitting is uniform, fills the longer side, and is centred**
    - **Validates: Requirements 19.2**

- [x] 6. Implement world creation and the `stepWorld` state machine
  - [x] 6.1 Create `src/core/world.js`
    - `createInitialWorld(config, playArea, highScore, rng)` returns a `Main_Menu` world with the Ghost centered at (`ghostStartXRatio`·width, `ghostStartYRatio`·height), `vy = 0`, size from config, no pipes, clouds from `createClouds`, `score = 0`, `pipeSpeed = basePipeSpeed`, `speedTier = 0`, `muted = false`, and `menu = { bestScoreOpen: false }`; no tuning values are copied into `World`
    - Export `resetToMenu(world, config)` that restores the start position, `vy = 0`, no pipes, `score = 0`, `menu.bestScoreOpen = false`, keeping `highScore`, `rng`, `clouds`, and `muted`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 10.3, 10.4, 10.5, 15.1, 18.9_

  - [x]* 6.2 Write unit tests for world creation in `tests/core/world.test.js`
    - Initial state is `Main_Menu`; Ghost starts at 30% width / 50% height; score 0; `pipeSpeed = basePipeSpeed`; cloud count equals `config.cloudCount`; `menu.bestScoreOpen` is false
    - _Requirements: 1.1, 1.3, 1.5, 12.3, 15.1, 18.9_

  - [x] 6.3 Create `src/core/step.js` with `stepWorld(world, input, dt, config)` for Playing, Paused, and Game_Over
    - `Playing`: on `togglePause` go to `Paused` with no other change and emit `StateEntered "Paused"`; otherwise run flap (only from `input.flap`, never from `startKey` alone, so Enter does not flap) → integrate → spawn/cull → `updateScore` → `applyDifficulty` → scroll pipes and clouds at `pipeSpeed` → `checkCollisions(ghost, pipes, playArea, config)`
    - Every applied Flap emits both `FlapApplied` and `PlaySound "jump"`
    - On collision go to `Game_Over`, set `highScore = max(score, highScore)`, emit `PlaySound "gameOver"` and `StateEntered "Game_Over"`, and emit `PersistHighScore` only when the high score increased
    - `Paused`: on `togglePause` return to `Playing` and emit `StateEntered "Playing"`; ignore flap and dt
    - `Game_Over`: on `pointer`, `startKey`, or `restart` call `resetToMenu` (panel closed) and emit `StateEntered "Main_Menu"`; otherwise freeze
    - Evaluate collisions only in `Playing`; read every tuning value from `config`; return a fresh `{ world, effects }` and never mutate the input
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 10.2, 10.3, 10.4, 10.5, 13.1, 13.2, 15.5, 15.6, 17.5, 17.10, 18.9, 19.5, 19.6, 19.11, 20.2_

  - [x] 6.4 Add `Main_Menu` and Best_Score_Panel handling to `src/core/step.js`
    - Panel closed: `highScoresPressed` or `toggleBestScore` opens the panel (no start, no flap); otherwise `startKey`, `playPressed`, or `pointer` goes to `Playing`, sets score 0, `pipeSpeed = basePipeSpeed`, `speedTier = 0`, applies the first Flap, and emits `FlapApplied`, `PlaySound "jump"`, and `StateEntered "Playing"`
    - Panel open: `backPressed`, `escape`, or `toggleBestScore` closes the panel and does not start or flap; every other input leaves the world unchanged
    - When panel and start flags arrive in the same frame, panel inputs win
    - _Requirements: 2.1, 2.2, 2.3, 15.1, 18.2, 18.4, 18.5, 18.6, 18.7, 18.11, 20.2_

  - [x] 6.5 Create world and input generators in `tests/arbitraries/world.js`
    - `ghostArb`, `dtArb` (0 to `MAX_DT`, including 0), `pipesArb`, and `worldArb(state)` built from `validConfigArb` and seeded RNGs, with both `menu.bestScoreOpen` values, including worlds with the Hitbox overlapping a pipe, the Ground, or the Ceiling, and exact-contact worlds (`y + r == groundY`)
    - `inputFrameArb` with arbitrary combinations of every `InputFrame` flag, including simultaneous start and panel flags
    - _Requirements: 8.1, 8.2, 8.3, 18.5, 18.6, 19.7_

  - [x]* 6.6 Write property test in `tests/properties/p04-flap-only-playing.property.test.js`
    - **Property 4: Flap only applies while Playing**
    - **Validates: Requirements 3.5, 5.5**

  - [x]* 6.7 Write property test in `tests/properties/p06-start-transition.property.test.js`
    - **Property 6: Start transition resets score and applies first flap**
    - **Validates: Requirements 2.1, 2.2, 2.3, 18.7, 20.2**

  - [x]* 6.8 Write property test in `tests/properties/p07-pause-noop.property.test.js`
    - **Property 7: Pause is a no-op on the simulation**
    - **Validates: Requirements 5.2, 5.3**

  - [x]* 6.9 Write property test in `tests/properties/p08-pause-roundtrip.property.test.js`
    - **Property 8: Pause/resume round-trip preserves the world**
    - **Validates: Requirements 5.1, 5.4**

  - [x]* 6.10 Write property test in `tests/properties/p12-score-once.property.test.js`
    - **Property 12: Each pipe is scored exactly once**
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 6.11 Write property test in `tests/properties/p13-collision-ends.property.test.js`
    - **Property 13: Any collision ends the game**
    - Include exact-contact cases and overlapping worlds in `Main_Menu`, `Paused`, and `Game_Over`
    - **Validates: Requirements 8.1, 8.2, 8.3, 19.4, 19.6, 19.7, 19.11**

  - [x]* 6.12 Write property test in `tests/properties/p14-game-over-freeze.property.test.js`
    - **Property 14: Game_Over freezes the world**
    - **Validates: Requirements 8.4, 8.5**

  - [x]* 6.13 Write property test in `tests/properties/p15-high-score-max.property.test.js`
    - **Property 15: High score becomes the maximum on Game_Over**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x]* 6.14 Write property test in `tests/properties/p16-restart-reset.property.test.js`
    - **Property 16: Restart resets to a clean Main_Menu**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5**

  - [x]* 6.15 Write property test in `tests/properties/p21-sound-effects.property.test.js`
    - **Property 21: Sound effects are emitted on flap and on game over**
    - **Validates: Requirements 13.1, 13.2**

  - [x]* 6.16 Write property test in `tests/properties/p30-config-per-step.property.test.js`
    - **Property 30: stepWorld uses the config passed in each call without resetting the session**
    - Use `validConfigArb` twice with shared non-physics fields
    - **Validates: Requirements 17.5, 17.10**

  - [x]* 6.17 Write property test in `tests/properties/p41-panel-no-start.property.test.js`
    - **Property 41: The Best_Score_Panel never starts a game or flaps**
    - **Validates: Requirements 18.5, 18.6, 18.11**

  - [x]* 6.18 Write property test in `tests/properties/p42-panel-roundtrip.property.test.js`
    - **Property 42: Opening then closing the panel is a round trip**
    - **Validates: Requirements 18.2, 18.4**

  - [x]* 6.19 Write property test in `tests/properties/p43-menu-closes-panel.property.test.js`
    - **Property 43: Entering Main_Menu closes the panel**
    - **Validates: Requirements 18.9**

  - [x]* 6.20 Write unit tests for `stepWorld` in `tests/core/step.test.js`
    - A `Playing` step with only `startKey` (Enter) leaves `vy` changed by gravity only; a start and each in-`Playing` Flap emit both `FlapApplied` and `PlaySound "jump"`; each transition emits the matching `StateEntered`
    - _Requirements: 2.1, 3.3, 10.2, 20.2_

- [x] 7. Implement the Ghost animation module
  - [x] 7.1 Create `src/core/animation.js`
    - `initialAnimState()` returns Idle, frame 0, `elapsedMs` 0, `rotationDeg` 0
    - `velocityTilt(vy, physics)` returns `clamp(−20 + 65·(vy − flapVelocity) / (terminalVelocity − flapVelocity), −20, 45)`
    - Frame tables from the design: Idle 4×150 ms with offsetY [0, −2, 0, +2] looping; Flap 60/60/80 ms squash/stretch/settle → Glide; Glide single frame; Death 80 flash, 120 cross eyes, 60 offsetX +2, 60 offsetX −2 → hold (cross, offset 0, opacity 0.7)
    - `stepAnimation(anim, effects, dtMs, world, config, reducedMotion)` applies, in order: events (`StateEntered Main_Menu` → `initialAnimState()`; `StateEntered Game_Over` → Death frame 0 with `lockedRotationDeg = anim.rotationDeg`; `FlapApplied` → Flap frame 0, discarding remaining time), with event resets not consuming `dtMs`; pause freeze when `world.state === "Paused"`; advance with overflow carry; rotation from `velocityTilt` in Flap/Glide, 0 in Idle, locked in Death
    - `frameVisual(anim, reducedMotion)` returns `{ offsetX, offsetY, scaleX, scaleY, rotationDeg, opacity, eyes, flash }`; with `reducedMotion` it zeroes Idle offsetY and Death offsetX and sets `flash = false`, keeping eyes, opacity, and timing unchanged
    - Never read or return a `World` from `stepAnimation`'s result; one flash per Death entry only
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.12, 20.13_

  - [x] 7.2 Create animation generators in `tests/arbitraries/anim.js`
    - `animStateArb` over every kind, valid frame index, `elapsedMs` within the frame duration, rotation in [−20, 45]; `animEventsArb` from `FlapApplied` and `StateEntered`; `dtMsSeqArb` in `[0, MAX_DT·1000]` including 0 and exact boundaries (60, 120, 150, 200, 320)
    - _Requirements: 20.1, 20.2, 20.6, 20.8_

  - [x]* 7.3 Write property test in `tests/properties/p34-anim-isolation.property.test.js`
    - **Property 34: Animation never changes the simulation**
    - Run a random `(InputFrame, dt)` script through `stepWorld` with and without `stepAnimation`/`frameVisual` interleaved, for both `reducedMotion` values, and deep-compare worlds and effects
    - **Validates: Requirements 19.4, 20.9**

  - [x]* 7.4 Write property test in `tests/properties/p35-velocity-tilt.property.test.js`
    - **Property 35: Rotation is a clamped linear function of vertical velocity**
    - **Validates: Requirements 20.5**

  - [x]* 7.5 Write property test in `tests/properties/p36-flap-anim-restart.property.test.js`
    - **Property 36: Every Flap restarts the Flap animation from frame 0**
    - **Validates: Requirements 20.2, 20.3, 20.4**

  - [x]* 7.6 Write property test in `tests/properties/p37-frame-tables.property.test.js`
    - **Property 37: Frame tables drive Idle and Death timing**
    - **Validates: Requirements 20.1, 20.6, 20.11, 20.12**

  - [x]* 7.7 Write property test in `tests/properties/p38-pause-anim.property.test.js`
    - **Property 38: Pausing freezes the animation state**
    - **Validates: Requirements 20.8**

  - [x]* 7.8 Write property test in `tests/properties/p39-reduced-motion.property.test.js`
    - **Property 39: Reduced motion removes motion and flash but not timing**
    - **Validates: Requirements 20.10**

  - [x]* 7.9 Write property test in `tests/properties/p40-menu-anim-reset.property.test.js`
    - **Property 40: Entering Main_Menu resets the animation to Idle frame 0**
    - **Validates: Requirements 20.13**

- [x] 8. Checkpoint - Ensure all core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the shell
  - [x] 9.1 Create `src/shell/constants.js`
    - Export `STORAGE_KEY`, `ASSET_PATHS` (`assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`), `MAX_DT = 1/30`, `LOGICAL_WIDTH = 480`, `LOGICAL_HEIGHT = 640`, `SPRITE_LOAD_TIMEOUT_MS = 5000`, and `createPlayArea()` returning `{ width, height, groundY, ceilingY }`
    - Export `UI_BUTTONS` with `PLAY`, `HIGH_SCORES`, `BACK`, `RESTART`, `RESUME`, and `PAUSE` logical rects, each at least 44×44, with `label` and `visibleIn(world)` (PLAY/HIGH_SCORES in `Main_Menu` with panel closed, BACK with panel open, PAUSE in `Playing`, RESUME in `Paused`, RESTART in `Game_Over`), laid out per `ui-mockups.md` with PLAY and HIGH_SCORES not overlapping
    - Export `displayRect(button, s)` that grows a rect about its centre to at least `44 / s` logical px per side
    - _Requirements: 1.6, 5.1, 5.4, 9.3, 10.2, 12.5, 13.1, 13.2, 18.1, 18.8, 19.9_

  - [x] 9.2 Create `src/shell/highScoreStore.js`
    - `parseHighScore(raw)` returns an integer in [0, 999,999,999], or 0 for missing, empty, non-numeric, negative, fractional, or out-of-range values
    - `createHighScoreStore(storage = localStorage)` with `load()` (try/catch, never throws) and `apply(effects)` that writes `PersistHighScore` values as integers and swallows write errors
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 9.3, 9.4_

  - [x]* 9.3 Write property test in `tests/properties/p17-high-score-load.property.test.js`
    - **Property 17: Stored high score always loads as a valid non-negative integer**
    - Use a fake storage object, including one whose `getItem` throws
    - **Validates: Requirements 1.5, 1.7, 1.8**

  - [x]* 9.4 Write unit tests in `tests/shell/highScoreStore.test.js`
    - Empty storage loads 0; `setItem` throwing does not escape and the in-memory high score is retained in the world
    - _Requirements: 1.7, 9.3, 9.4_

  - [x] 9.5 Create `src/shell/audioManager.js`
    - `createAudioManager({ createAudio = (src) => new Audio(src), paths })` preloads jump and game-over sounds with error handlers
    - `apply(effects)` resets `currentTime = 0` and calls `play()` for each `PlaySound`, catching sync errors and rejected promises; other effect types are ignored
    - `setMuted(muted)` suppresses all playback while muted
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x]* 9.6 Write property test in `tests/properties/p22-mute.property.test.js`
    - **Property 22: Muting suppresses all sound playback**
    - Use a mocked `createAudio` that counts `play()` calls
    - **Validates: Requirements 13.5**

  - [x]* 9.7 Write unit tests in `tests/shell/audioManager.test.js`
    - A second jump while playing resets `currentTime` to 0; a rejected `play()` and a throwing constructor do not escape
    - _Requirements: 13.3, 13.4_

  - [x] 9.8 Create `src/shell/inputController.js`
    - `hitTest(p, buttons, world)` returns the id of the visible button whose `displayRect` contains the logical point, or `null`
    - `createInputController({ target, keyTarget, toLogical, getWorld, getDisplayScale, buttons = UI_BUTTONS, isPanelTarget, onToggleMute })` listens for `mousedown`, `touchstart` (with `preventDefault`), and `keydown`
    - Pointer: PLAY → `playPressed`, HIGH_SCORES → `highScoresPressed`, BACK → `backPressed`, RESTART → `restart`, PAUSE/RESUME → `togglePause`; no button hit → `pointer` and `flap`
    - Keys: Space → `startKey` and `flap`; Enter → `startKey` only; `P` → `togglePause`; `H` → `toggleBestScore`; `Escape` → `escape`; `M` → `onToggleMute()`; drop every `keydown` with `event.repeat === true`
    - Ignore events for which `isPanelTarget(event.target)` is true (defaults to always false)
    - `drainInputBuffer()` returns one full `InputFrame` and clears the buffer, so repeated events in a frame collapse to one; export `dispose()` to remove listeners
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.6, 5.1, 5.4, 10.2, 13.5, 17.9, 18.1, 18.2, 18.4, 18.7, 18.8, 18.10_

  - [x]* 9.9 Write property test in `tests/properties/p05-single-flap-per-frame.property.test.js`
    - **Property 5: Consecutive flap inputs in one frame apply exactly one Flap**
    - `// @vitest-environment jsdom`; dispatch N raw flap events, drain once, step a `Playing` world, and assert at most one jump effect
    - **Validates: Requirements 3.6**

  - [x]* 9.10 Write unit tests in `tests/shell/inputController.test.js`
    - `// @vitest-environment jsdom`; mousedown/touchstart hitting no button and Space map to `flap`; Enter sets `startKey` but never `flap`; `P` maps to `togglePause`; H and Escape set `toggleBestScore` and `escape`; events from a panel target are ignored
    - Key repeat: H with `repeat: false` then several with `repeat: true` in later frames yields `toggleBestScore` once; same for Escape
    - Buttons: every `UI_BUTTONS` rect is ≥ 44×44; `displayRect` is ≥ 44 CSS px per side at scales 0.5, 0.75, 1, and 2; PLAY and HIGH_SCORES (and their grown rects at the smallest scale) do not overlap; `hitTest` inside HIGH_SCORES returns `HIGH_SCORES` and only returns buttons visible in the current state
    - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.4, 17.9, 18.1, 18.2, 18.4, 18.8, 18.10_

  - [x] 9.11 Create `src/shell/ghostSprite.js`
    - `prepareGhostSprite(image, { size = 32, createCanvas })` draws the source once into a `size×size` offscreen canvas with `imageSmoothingEnabled = true`, `imageSmoothingQuality = "high"`, at `fitRect(image.width, image.height, size)`; with `image === null` it draws a filled white ghost-like shape entirely inside the cell
    - `loadGhostSprite({ src, timeoutMs = SPRITE_LOAD_TIMEOUT_MS, createImage, createCanvas, setTimer })` resolves to the prepared sprite on `load`, or to the fallback on `error` or timeout, ignoring a late `load` after the timeout; never rejects
    - _Requirements: 12.1, 19.2, 19.3, 19.9_

  - [x]* 9.12 Write unit tests in `tests/shell/ghostSprite.test.js`
    - With a stub 1290×1567 image and a mock canvas/context: smoothing is enabled, `drawImage` is called once with the `fitRect(1290, 1567, 32)` destination, and a 32×32 canvas is returned; with `null` the white fill bounds lie inside the 32×32 cell
    - With fake timers and an image that never loads, the fallback is resolved after 5000 ms and a later `load` does not replace it
    - _Requirements: 19.2, 19.3, 19.9_

  - [x] 9.13 Create `src/shell/renderer.js`
    - `createRenderer(ctx, { ghostSprite, getConfig, buttons = UI_BUTTONS })` returns `draw(world, visual)` that scales logical coordinates to the canvas with `imageSmoothingEnabled = false`
    - Draw the light blue sky, clouds as white shapes at their opacity, green top/bottom pipes, and `formatScoreDisplay` text at the bottom in a pixel font sized from `config.scoreFontSize`
    - Ghost: blit the cached sprite at `(Math.round(x − 16), Math.round(y − 16), 32, 32)`, applying `visual` offsets, scale, rotation about the cell centre, opacity, cross-eyes overlay, and flash tint inside `save()`/`restore()` only; never rescale the source image per frame
    - Overlays and buttons from `UI_BUTTONS` per `ui-mockups.md`: title + high score + start prompt + PLAY and HIGH SCORES on `Main_Menu`; Best_Score_Panel (BEST SCORE heading, `world.highScore`, BACK) when `menu.bestScoreOpen`; PAUSE while `Playing`; paused indicator + RESUME on `Paused`; final score + high score + restart prompt + RESTART on `Game_Over`
    - _Requirements: 1.2, 1.4, 1.5, 5.1, 5.3, 6.3, 7.3, 9.5, 10.1, 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 12.6, 18.1, 18.3, 18.8, 19.1, 19.3, 19.4, 20.9_

  - [x]* 9.14 Write rendering tests in `tests/shell/renderer.test.js`
    - Use a recording mock 2D context (jsdom has no canvas implementation) and assert, per `Game_State` and panel state, that the score text is drawn inside the play area and the expected overlay strings and buttons are drawn, and that the Best_Score_Panel shows the same `highScore` as the Score_Display
    - For a fractional position such as `(144.4, 320.6)`, assert `drawImage` receives the cached sprite at `(Math.round(x − 16), Math.round(y − 16), 32, 32)` with smoothing off; across 100 frames `drawImage` never receives the source image
    - _Requirements: 1.2, 5.1, 5.3, 7.3, 9.5, 10.1, 11.1, 12.1, 18.1, 18.3, 19.1, 19.3_

  - [x] 9.15 Create `src/shell/startup.js`
    - `runStartupValidation(config, schema, warn = console.warn)` calls `resolveConfig`, logs each warning with key, current value, and allowed range or relation, and returns `{ config, warnings }`; never throws
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 19.10_

  - [x]* 9.16 Write unit tests in `tests/shell/startup.test.js`
    - With a `warn` spy, `DEFAULT_CONFIG` logs zero warnings and is returned unchanged; an invalid config logs one warning per problem and the function returns normally; an invalid radius is returned as 12 with a warning
    - _Requirements: 16.2, 16.3, 16.6, 19.10_

  - [x] 9.17 Create `src/shell/reducedMotion.js`
    - `createReducedMotion(matchMedia = globalThis.matchMedia)` returns `{ get(), dispose() }` tracking `(prefers-reduced-motion: reduce)` with a `change` listener; returns `false` when `matchMedia` is missing
    - _Requirements: 20.10_

  - [x]* 9.18 Write unit tests in `tests/shell/reducedMotion.test.js`
    - Stubbed matching `matchMedia` gives `true`, a `change` event updates the value, and a missing `matchMedia` gives `false`
    - _Requirements: 20.10_

  - [x] 9.19 Create `src/shell/gameLoop.js`
    - Export pure `computeDt(now, last)` returning `min((now - last) / 1000, MAX_DT)` (0 on the first frame)
    - `createGameLoop({ initialWorld, initialConfig, input, renderer, audio, store, getReducedMotion, raf = requestAnimationFrame })` holds `world`, `currentConfig`, and `anim = initialAnimState()`
    - Each tick: drain input, `stepWorld(world, input, dt, currentConfig)`, `anim = stepAnimation(anim, effects, dt·1000, world, currentConfig, reducedMotion)`, `renderer.draw(world, frameVisual(anim, reducedMotion))`, then `audio.apply(effects)` and `store.apply(effects)`
    - Expose `getConfig()`, `setConfig(next)` (replaces `currentConfig` without touching `world` or `anim`), `getWorld()`, `start()`, `stop()`
    - _Requirements: 3.1, 3.2, 3.3, 12.5, 13.1, 13.2, 17.5, 17.10, 20.2, 20.9, 20.10_

  - [x]* 9.20 Write unit tests in `tests/shell/gameLoop.test.js`
    - With a fake `raf` and stubs: `computeDt` clamps to `MAX_DT`; `setConfig` takes effect on the next tick without resetting `world`; effects reach audio and store; the renderer receives the `frameVisual` for the updated `anim`, and `getReducedMotion` is passed through
    - _Requirements: 12.5, 17.5, 17.10, 20.10_

  - [x] 9.21 Wire the shell in `src/main.js`
    - Get the canvas and 2D context (log one `console.error` and stop if null), size the canvas from the logical resolution
    - Run `runStartupValidation(DEFAULT_CONFIG, CONFIG_SCHEMA)` and use its returned config, load the high score, create the seeded RNG and initial world, `await loadGhostSprite(...)` (fallback on error or 5 s timeout), create audio, reduced-motion tracker, input (with `onToggleMute` toggling `audio.setMuted` on `M`), renderer, and loop, then start it
    - _Requirements: 1.1, 1.6, 13.5, 16.1, 16.3, 17.8, 19.9, 19.10, 20.10_

- [x] 10. Implement the TuningPanel
  - [x] 10.1 Create `src/shell/tuningPanel.js` and panel styles
    - `createTuningPanel({ search, schema, getConfig, setConfig, parent, keyTarget = window })` returns `null` and creates no DOM or listeners unless `URLSearchParams(search).get("debug") === "1"`
    - Build a hidden, absolutely positioned root with one row per `panel: true` entry: `<label>`, linked `<input type="range">` and `<input type="number">` using `min`, `max`, `step`
    - On `input`/`change`, parse the value (fall back to current value if non-numeric), clamp with `clampToSchema`, sync both inputs, and call `setConfig(setConfigValue(getConfig(), key, clamped))`
    - `D` keydown on `keyTarget` toggles visibility; panel `mousedown`, `touchstart`, `click`, and `keydown` call `stopPropagation()`
    - Expose `root`, `toggle()`, `contains(target)`; write nothing to localStorage or the URL
    - Add panel styles to `styles.css`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8, 17.9, 17.10_

  - [x] 10.2 Add the copy control to `src/shell/tuningPanel.js`
    - "Copy config" button calls `navigator.clipboard.writeText(serializeConfig(getConfig()))`; if the API is missing or the promise rejects, show a selected `<textarea>` containing the same text; no error escapes
    - _Requirements: 17.7_

  - [x] 10.3 Wire the TuningPanel into `src/main.js`
    - Create the panel with `location.search`, `CONFIG_SCHEMA`, `loop.getConfig`, `loop.setConfig`, and the canvas container
    - Pass `isPanelTarget = (t) => panel?.contains(t) ?? false` to the InputController
    - _Requirements: 17.1, 17.2, 17.5, 17.8, 17.9, 17.10_

  - [x]* 10.4 Write jsdom tests for enablement and edits in `tests/shell/tuningPanel.test.js`
    - `"?debug=1"` returns a panel and appends its root; `""` and `"?debug=0"` return `null`, add no DOM, and `D` changes nothing
    - `D` toggles hidden state; one row per `panel: true` entry; a number input above `max` calls `setConfig` with the clamped value in a new object, old config unmutated
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x]* 10.5 Write jsdom tests for copy in `tests/shell/tuningPanel.copy.test.js`
    - Mocked `writeText` receives `serializeConfig(currentConfig)`; with `writeText` rejecting or `navigator.clipboard` undefined, a selected `<textarea>` with the same text appears and no error escapes
    - _Requirements: 17.7_

  - [x]* 10.6 Write jsdom tests for isolation and no persistence in `tests/shell/tuningPanel.isolation.test.js`
    - Dispatch `mousedown`, `touchstart`, and Space `keydown` on a panel input with an InputController using `panel.contains`; `drainInputBuffer()` yields `flap: false`
    - After edits, `localStorage` is untouched and a fresh loop starts from `DEFAULT_CONFIG`
    - _Requirements: 17.8, 17.9_

- [x] 11. Final integration
  - [x]* 11.1 Write a session integration test in `tests/integration/session.test.js`
    - Drive `stepWorld` and `stepAnimation` with `DEFAULT_CONFIG` and a seeded RNG through `Main_Menu → Best_Score_Panel open → closed → Playing → Paused → Playing → Game_Over → Main_Menu`, asserting state transitions, that opening/closing the panel does not start a game, `FlapApplied`/jump and game-over effects, `PersistHighScore` on a new best, animation kinds (Idle → Flap → Glide → Death → Idle), and a clean reset with the panel closed
    - Apply a mid-session `setConfigValue` change and assert the session continues without reset
    - _Requirements: 2.1, 5.1, 5.4, 8.1, 9.1, 9.3, 10.2, 10.5, 13.1, 13.2, 17.5, 18.2, 18.4, 18.9, 20.2, 20.4, 20.6, 20.13_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The design defines 43 correctness properties; each has exactly one property test file (`tests/properties/pNN-*.property.test.js`) that runs at least 100 fast-check iterations and starts with `// Feature: flappy-kiro, Property {number}: {property_text}`
- Property tests live in one file per property so they can be written in parallel
- The game must be served over a local static server (e.g. `python3 -m http.server`) because ES modules do not load from `file://`
- Frame rate (R12.5), input latency (R3.1–3.3, R13.1–13.2), panel response time (R18.2, R18.4), and animation frame-duration tolerances in the real browser depend on hardware and are left to manual play-testing, outside this task list

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.9", "5.11"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1", "4.5", "5.1", "5.5", "5.8", "5.10", "5.12", "7.1"] },
    { "id": 3, "tasks": ["2.3", "2.5", "7.2"] },
    { "id": 4, "tasks": ["2.4", "2.7", "2.8", "2.9", "3.3", "3.4", "3.5", "4.2", "4.3", "4.4", "4.6", "4.7", "5.2", "5.3", "5.4", "5.6", "5.7", "6.1", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9"] },
    { "id": 5, "tasks": ["2.6", "2.10", "2.11", "6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4"] },
    { "id": 7, "tasks": ["6.5"] },
    { "id": 8, "tasks": ["6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "6.12", "6.13", "6.14", "6.15", "6.16", "6.17", "6.18", "6.19", "6.20", "7.3"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["9.2", "9.5", "9.8", "9.11", "9.13", "9.15", "9.17"] },
    { "id": 11, "tasks": ["9.3", "9.4", "9.6", "9.7", "9.9", "9.10", "9.12", "9.14", "9.16", "9.18", "9.19"] },
    { "id": 12, "tasks": ["9.20", "9.21"] },
    { "id": 13, "tasks": ["10.1"] },
    { "id": 14, "tasks": ["10.2", "10.4"] },
    { "id": 15, "tasks": ["10.3", "10.5"] },
    { "id": 16, "tasks": ["10.6", "11.1"] }
  ]
}
```
