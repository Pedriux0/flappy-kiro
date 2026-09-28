# Design Document

## Overview

Flappy Kiro is a retro, pixel-styled endless scroller that runs entirely in the browser with no build step. It is implemented as a single `index.html` plus a small set of vanilla JavaScript ES modules and one CSS file, using the HTML5 Canvas 2D API for rendering and the Web Audio-adjacent `HTMLAudioElement` API for sound. This zero-dependency, no-toolchain approach is the natural fit for a small retro game and satisfies the "runs in a browser" intent while keeping the entire simulation deterministic and testable.

The central design idea is a strict separation between a **pure simulation core** and the **impure shell** (rendering, input, audio, storage, and the `requestAnimationFrame` loop). All game rules — physics integration, pipe scrolling and generation, collision detection, scoring, and state transitions — live in pure functions that take the current world plus inputs and return a new world. The shell owns the browser APIs, the timing, and the pixels. This separation is what makes the physics (Requirement 14) and collision/scoring logic (Requirements 7, 8) verifiable with property-based tests: the pure core can be run thousands of times with generated inputs, with no canvas or DOM required.

Key design decisions and their rationale:

- **Fixed logical resolution with delta-time integration.** The world is simulated in a fixed logical coordinate space (e.g. 480×640 logical pixels) and scaled to the canvas. Motion is integrated using `Delta_Time` so behavior is frame-rate independent (Requirement 14.5, 14.6, 12.5). All the requirement constants (gravity 1600, flap −450, terminal 700) are expressed in logical pixels per second.
- **Explicit finite state machine.** A single `Game_State` enum (`Main_Menu`, `Playing`, `Paused`, `Game_Over`) gates every update and every input, directly modeling Requirements 1, 2, 5, 8, and 10 and preventing physics/scoring from running in the wrong state.
- **Semi-fixed timestep with a clamped delta.** The loop measures real elapsed time but clamps `Delta_Time` to a maximum so a background-tab stall or a slow frame cannot teleport the Ghost through a pipe. This preserves fair collision detection (Requirement 8) while keeping motion continuous (Requirement 12.5 ≥ 30 FPS).
- **Circular Hitbox collision.** The Ghost collides as a circle of radius `ghostHitboxRadius` (default 12 px) centred on its position `(x, y)`, tested against each pipe rectangle (circle-vs-rect by clamping the centre to the rect) and against the ground and ceiling (Requirements 8.1–8.3, 19.4–19.7). All tests are strict: touching at exactly the radius is not a hit. The circle is rotation-invariant, so the visual tilt never affects collision, and it is cheap, predictable, and easy to state as a property. The ~4 px slack between the 24 px hitbox diameter and the 32 px sprite cell makes near-misses feel fair.
- **Presentation state lives outside the simulation.** Ghost animation (Idle, Flap, Glide, Death; Requirement 20) is a pure `animation` module in the core, but its `AnimState` is owned by the loop, not stored in `World`. `stepAnimation` consumes the events produced by `stepWorld` and never feeds back into it, so every simulation property holds with or without animation (Requirement 20.9).
- **Menu UI sub-state in the core.** The Best_Score_Panel (Requirement 18) is a sub-state of `Main_Menu` held in `World.menu.bestScoreOpen`, so opening, closing, and "this input does not start the game" are decided by the pure `stepWorld` and are property-testable. The shell only hit-tests button rectangles and reports which control was pressed.
- **Centralized tuning configuration.** A single `GameConfig` object is the source of truth for all gameplay tuning values — physics constants (gravity, flap velocity, terminal velocity), pipe speed/gap/spacing, cloud layer speeds, Ghost and pipe dimensions, and the cloud opacity range — so the code carries no scattered magic numbers, the game is easy to tune in one place, and the core is easy to test with alternate configs. Genuinely structural constants (the localStorage key, asset paths, `MAX_DT`, and the logical resolution) are grouped separately as shell-level constants rather than mixed in with gameplay tuning. The config documents the requirement-mandated bounds in comments (e.g. Ghost 24–48 px, pipe width 40–80 px, cloud opacity 0.3–0.8, flap velocity −400 to −500), so the source of each value stays visible next to it.
- **Difficulty progression via a single evolving pipe speed.** The `World` holds one `pipeSpeed` value shared by every Pipe_Pair. It starts at `Base_Pipe_Speed` and increases by a fixed `Speed_Step` at each score threshold (every `speedUpInterval` = 5 points), capped at `Max_Pipe_Speed` (Requirement 15). The target speed is a pure, deterministic function of the current Score — `min(basePipeSpeed + floor(score / speedUpInterval) * speedStep, maxPipeSpeed)` — so a single common speed always applies to all active and future pipes (Requirement 15.5, consistent with 6.1) and the increase is idempotent per score. To keep the parallax relationship intact as the pipes speed up, cloud layer speeds are derived as fixed ratios of the current `pipeSpeed` (each ratio in (0, 1)), so every Cloud_Layer stays strictly below the current pipe speed even after increases (Requirements 12.8, 15.6). Only the speed changes; the Gap vertical size stays fixed (Requirement 15.7).
- **Consistency with R12.7 ("constant horizontal speed").** Pipe_Speed changes only at score thresholds (Requirement 15.2), so between two Pipe_Speed changes every cloud layer speed `ratio · pipeSpeed` is constant. Each layer keeps a distinct fixed ratio for the whole session, so the layers always move at different speeds and keep their relative depth ordering. "Constant" in R12.7 is therefore read as constant between Pipe_Speed changes, with each layer's ratio to the pipe speed fixed.
- **Config is an argument to the core, passed every frame.** `stepWorld(world, input, dt, config)` receives the current `GameConfig` on every call and reads all tuning values from it rather than from copies stored in `World`. Live edits from the developer Tuning_Panel (Requirement 17) replace the loop's `currentConfig` and take effect on the next frame without resetting the session (Requirements 17.5, 17.10). The core stays pure because config is just another argument: the same `(world, input, dt, config)` always produces the same result.
- **Config validated against a schema at load.** A `CONFIG_SCHEMA` in the `config` module documents each tunable's allowed range. `validateConfig` checks the active config at load and returns warnings the shell logs with `console.warn`; loading never blocks (Requirement 16). The same schema drives Tuning_Panel controls and clamping (Requirement 17.4, 17.6). One value is stricter: an invalid `ghostHitboxRadius` is replaced with the default 12 by `resolveConfig` (Requirement 19.10), while every other invalid value keeps the warn-only behaviour (Requirement 16.3).
- **Reuse of existing assets.** The design references the assets already present at the workspace root: `assets/ghosty.png` (Ghost sprite), `assets/jump.wav` (Flap sound), and `assets/game_over.wav` (Game_Over sound). The 1290×1567 sprite is pre-scaled once at load into a 32×32 offscreen canvas (smoothing on) and then blitted at integer coordinates with smoothing off, avoiding per-frame downscaling artefacts (Requirements 19.1–19.3). Rendering falls back to a drawn white 32×32 shape and audio degrades silently if an asset fails to load (Requirements 13.4, 19.9).

## Architecture

### High-level structure

The application is split into a pure core and an impure shell. The shell drives one frame at a time: it gathers buffered input, computes a clamped delta, calls the pure `stepWorld(world, input, dt, config)` reducer with the loop's `currentConfig`, then renders the returned world and fires any audio/storage side effects the step requested.

```mermaid
graph TD
    subgraph Shell["Impure Shell (browser)"]
        Loop["GameLoop (requestAnimationFrame)"]
        Input["InputController (mouse/touch/keyboard, button hit-testing, event.repeat filter)"]
        Buttons["UI_BUTTONS (logical rects ≥ 44×44)"]
        Renderer["Renderer (Canvas 2D, buttons + panels)"]
        Sprite["prepareGhostSprite (32×32 offscreen, once at load)"]
        Motion["matchMedia(prefers-reduced-motion)"]
        Audio["AudioManager (HTMLAudioElement)"]
        Storage["HighScoreStore (localStorage)"]
        Panel["TuningPanel (debug=1 only, DOM overlay)"]
    end

    subgraph Core["Pure Simulation Core (no DOM)"]
        Config["config: GameConfig, CONFIG_SCHEMA, validateConfig, resolveConfig, clampToSchema"]
        Step["stepWorld(world, input, dt, config)"]
        Physics["physics: integrate + terminal cap"]
        Pipes["pipes: scroll / spawn / cull"]
        Clouds["clouds: parallax scroll"]
        Collision["collision: circle Hitbox vs rects / ground / ceiling"]
        Scoring["scoring: pass detection"]
        FSM["state machine: transitions + Main_Menu panel sub-state"]
        Anim["animation: stepAnimation, frameVisual (AnimState outside World)"]
        Fit["sprite: fitRect"]
    end

    Buttons --> Input
    Buttons --> Renderer
    Input -->|InputFrame| Loop
    Config -->|createInitialWorld| Step
    Config -.->|resolveConfig: config + warnings| Loop
    Config -.->|CONFIG_SCHEMA, clampToSchema| Panel
    Panel -->|currentConfig| Loop
    Loop -->|world, input, dt, currentConfig| Step
    Step --> FSM
    Step --> Physics
    Step --> Pipes
    Step --> Clouds
    Step --> Collision
    Step --> Scoring
    Step -->|new World + Effects| Loop
    Loop -->|anim, effects, dtMs, world, reducedMotion| Anim
    Anim -->|new AnimState| Loop
    Motion -.->|reducedMotion| Loop
    Fit --> Sprite
    Sprite -->|cached 32×32 canvas or fallback| Renderer
    Loop -->|World + frameVisual(anim)| Renderer
    Loop -->|Effects| Audio
    Loop -->|Effects| Storage
    Storage -.->|initial High_Score| Loop
```

A small `config` module lives in the pure core and holds `DEFAULT_CONFIG` (the `GameConfig` of gameplay tuning constants), `CONFIG_SCHEMA` (allowed range and panel metadata per tunable), and the pure helpers `validateConfig`, `resolveConfig`, and `clampToSchema`. It has no dependencies on any other module. The loop holds a `currentConfig` reference, initialized to `resolveConfig(DEFAULT_CONFIG, CONFIG_SCHEMA).config` (identical to `DEFAULT_CONFIG` unless its Hitbox radius is invalid) and replaced immutably by the TuningPanel when enabled; it passes `currentConfig` to `stepWorld` every frame. Both the core (via `createInitialWorld(config)`, which seeds the initial `World`) and the shell import it — the core to build and advance the simulation, and the shell to size and lay out what it draws — so every tuning value has exactly one definition that flows outward from `config`.

### The game loop

The loop runs on `requestAnimationFrame`. Each tick it computes `dt = min((now - last) / 1000, MAX_DT)`, drains the input buffer into a single `InputFrame`, calls `stepWorld(world, input, dt, currentConfig)`, advances the loop-owned `anim` with `stepAnimation(anim, effects, dt * 1000, world, currentConfig, reducedMotion)`, applies the returned effects, and renders the world plus `frameVisual(anim, reducedMotion)`. Animation uses the same clamped delta as the simulation. Consolidating buffered inputs into one `InputFrame` per tick is what makes "consecutive flaps in the same frame apply exactly one Flap" true by construction (Requirement 3.6).

```mermaid
flowchart TD
    A["rAF tick(now)"] --> B["dt = min((now-last)/1000, MAX_DT)"]
    B --> C["input = drainInputBuffer()"]
    C --> C2["config = currentConfig (latest TuningPanel edit, else DEFAULT_CONFIG)"]
    C2 --> D["{world, effects} = stepWorld(world, input, dt, config)"]
    D --> D2["anim = stepAnimation(anim, effects, dt*1000, world, config, reducedMotion)"]
    D2 --> E["renderer.draw(world, frameVisual(anim, reducedMotion))"]
    E --> F["audio.apply(effects); store.apply(effects)"]
    F --> G["last = now"]
    G --> A
```

### State machine

`Game_State` is an explicit FSM. Physics, scrolling, spawning, and scoring run only while `Playing`. Every transition below is driven by `stepWorld` based on the `InputFrame` and collision results.

```mermaid
stateDiagram-v2
    [*] --> Main_Menu : load complete (R1.1)
    state Main_Menu {
        [*] --> PanelClosed : entering Main_Menu closes panel (R18.9)
        PanelClosed --> BestScorePanel : H / High Scores (R18.2, R18.6)
        BestScorePanel --> PanelClosed : Back / Esc / H (R18.4, R18.11)
        BestScorePanel --> BestScorePanel : other input ignored (R18.5)
    }
    Main_Menu --> Playing : from PanelClosed only - Space / Enter / Play / click or tap elsewhere (R2.1, R18.7)
    Playing --> Paused : P key / pause control (R5.1)
    Paused --> Playing : P key / resume control (R5.4)
    Playing --> Game_Over : Hitbox collision pipe/ground/ceiling (R8.1-8.3, R19.5-19.7)
    Game_Over --> Main_Menu : click / tap / Space / Enter / Restart (R10.2)
```

- `Main_Menu` has a UI sub-state, `world.menu.bestScoreOpen`. With the panel closed, H or the High Scores control opens it and neither starts the game nor flaps (Requirements 18.2, 18.6); Space, Enter, the Play control, or a click/tap outside the High Scores control starts the game (Requirements 2.1, 18.7). With the panel open, Back, Esc, or H closes it and that same input does not start the game (Requirements 18.4, 18.11); every other input is ignored (Requirement 18.5). Every entry into `Main_Menu` (initial load and from `Game_Over`) sets `bestScoreOpen = false` (Requirement 18.9).
- `Main_Menu → Playing` resets Score to 0 and applies the first Flap (Requirement 2.2, 2.3), and emits a `FlapApplied` effect so the Flap animation starts on the same frame (Requirement 20.2).
- Enter is a start key in `Main_Menu` and a restart key in `Game_Over` only. **Enter never flaps while `Playing`**; Requirement 3 is unchanged (click, tap, Space).
- Transitions also emit `StateEntered` effects (`Playing`, `Game_Over`, `Main_Menu`) so the loop-owned animation can react without inspecting audio effects.
- `Playing → Paused` freezes all motion and scoring while preserving exact position/velocity (Requirement 5.2, 5.3).
- `Paused → Playing` resumes from the preserved snapshot (Requirement 5.4).
- `Playing → Game_Over` freezes pipe movement and Ghost vertical motion, then resolves the High_Score and persists it (Requirements 8.4, 8.5, 9.1–9.3).
- `Game_Over → Main_Menu` resets the Ghost, clears all pipes, zeroes the Score (Requirement 10.3–10.5), and closes the Best_Score_Panel (Requirement 18.9).
- Collision is evaluated only in `Playing`; in `Main_Menu`, `Paused`, and `Game_Over` no overlap is ever treated as a collision (Requirement 19.11).

## Components and Interfaces

The system is organized into pure-core modules and shell modules. Interfaces are described in TypeScript-style signatures for clarity; the implementation is plain JavaScript (JSDoc types optional).

### Pure core

#### `stepWorld` (the reducer)

The single entry point for advancing the simulation by one frame. It is a pure function: same inputs always produce the same outputs, and it performs no I/O.

```ts
type StepResult = { world: World; effects: Effect[] };

function stepWorld(world: World, input: InputFrame, dt: number, config: GameConfig): StepResult;
```

- Reads every tuning value (gravity, flap and terminal velocity, pipe speeds and difficulty parameters, gap height, spawn distance, pipe width, cloud ratios) from the `config` argument, never from copies stored in `World`. A config change between two calls therefore takes effect on the next call without touching simulation state (Requirements 17.5, 17.10).
- Dispatches on `world.state`. In `Main_Menu`, `Paused`, and `Game_Over` it applies only the relevant transitions and no physics/scrolling. In `Playing` it runs the full update pipeline: apply flap → integrate physics → spawn/cull pipes → score → **apply difficulty (recompute `pipeSpeed` from the updated score)** → scroll pipes/clouds at the current `pipeSpeed` → detect collisions → maybe transition to `Game_Over`. Difficulty is applied after scoring (so the just-earned points are reflected) and before scrolling (so both pipes and clouds move at the updated speed on the same frame).
- Emits `Effect`s (see Data Models) describing side effects the shell must perform (`PlaySound`, `PersistHighScore`) and presentation events the loop-owned animation consumes (`FlapApplied`, `StateEntered`). The core never touches audio or storage directly. `FlapApplied` is emitted on exactly the steps where a Flap is applied (including the first Flap on `Main_Menu → Playing`), always alongside `PlaySound "jump"`, so animation never depends on audio effects.
- In `Main_Menu` it reads the menu fields of `InputFrame` and `world.menu.bestScoreOpen` to decide between opening/closing the Best_Score_Panel, ignoring the input, or starting the game (see the state machine notes). Only `Playing` evaluates collisions (Requirement 19.11).

#### `physics`

```ts
function applyFlap(ghost: Ghost, flapVelocity: number): Ghost;      // sets vy = flapVelocity
function integrate(ghost: Ghost, dt: number, cfg: PhysicsConfig): Ghost;
```

`stepWorld` calls these with values taken from its `config` argument: `applyFlap(ghost, config.physics.flapVelocity)` and `integrate(ghost, dt, config.physics)`.

- `applyFlap` sets vertical velocity to `Flap_Velocity` (−450), fully replacing prior velocity so momentum does not accumulate (Requirement 3.4, 14.2).
- `integrate` computes `vy' = min(vy + Gravity_Constant * dt, Terminal_Velocity)` then `y' = y + vy' * dt`, and leaves `x` unchanged (Requirements 4.1–4.4, 14.1, 14.3–14.6). Gravity and the terminal cap are the only forces (Requirement 14.4).

#### `pipes`

```ts
function scrollPipes(pipes: PipePair[], dt: number, speed: number): PipePair[];
function cullPipes(pipes: PipePair[]): PipePair[];                 // drop pairs fully past left edge (R6.5)
function maybeSpawnPipe(pipes: PipePair[], world: World, config: GameConfig, rng: RNG): PipePair[]; // spacing = config.spawnDistance, gap = config.gapHeight (R6.2, R6.4)
```

**Live edits to `gapHeight` or `spawnDistance` apply to newly spawned pipes only.** This is the chosen behavior: each `PipePair` stores its own `gapHeight` at spawn, and existing pipes keep their gap and position. A new pair is spawned when the rightmost pair's distance from the spawn edge reaches the current `config.spawnDistance`, so a spacing change affects the next spawn onward. This avoids pipes resizing or jumping under the Ghost mid-flight, and keeps R6.4's "fixed Gap per Pipe_Pair" true for every pair.

`scrollPipes` moves every pair left by `speed · dt`, where `speed` is the current evolving `world.pipeSpeed` (the single shared value produced by the difficulty step) rather than a fixed constant — so all pairs always scroll at one common speed that may ramp up over the run (Requirements 6.1, 15.5). Gap vertical position is chosen by `rng` within bounds that keep the whole Gap inside the play area (Requirement 6.4); Gap size is a fixed constant and is never altered by difficulty progression (Requirement 15.7). `rng` is an injected deterministic pseudo-random generator (see Data Models) so spawning is reproducible in tests.

#### `difficulty`

```ts
function targetPipeSpeed(score: number, cfg: GameConfig): number; // pure: min(base + floor(score/interval)*step, max)
function applyDifficulty(world: World, cfg: GameConfig): World;    // sets world.pipeSpeed & speedTier from world.score
```

`applyDifficulty` is a pure, deterministic function of the current `score` and the difficulty parameters in `GameConfig`. It computes the target speed as `min(basePipeSpeed + floor(score / speedUpInterval) * speedStep, maxPipeSpeed)` and returns a world whose `pipeSpeed` is set to that value and whose `speedTier` records how many `Speed_Step` increases have been applied (Requirements 15.1–15.5). Because the speed is derived solely from the current score, re-running it for the same score is idempotent — it never pushes the speed past the value the score alone dictates, and once the cap is reached further thresholds leave it unchanged (Requirements 15.3, 15.4). It runs in the `Playing` pipeline immediately after scoring and before scrolling, and the single resulting `pipeSpeed` is then used to scroll every pipe (Requirement 15.5) and to derive the cloud layer speeds. Because `pipeSpeed` is recomputed from `score` and the `config` argument on every `Playing` frame, a live change to `basePipeSpeed`, `maxPipeSpeed`, `speedStep`, or `speedUpInterval` applies on the next frame (Requirement 17.5).

#### `clouds`

```ts
function layerSpeeds(pipeSpeed: number, ratios: number[]): number[]; // ratio * pipeSpeed per layer
function scrollClouds(clouds: Cloud[], dt: number, pipeSpeed: number, ratios: number[]): Cloud[];
```

Each cloud belongs to a depth layer whose effective speed is computed as `ratio · pipeSpeed` from that layer's fixed ratio in `cloudLayerSpeedRatios` (each ratio in (0, 1)). Layer speeds are constant between Pipe_Speed changes, and each layer keeps a distinct fixed ratio, which is how R12.7's "different constant horizontal speed" is satisfied alongside difficulty progression. Because the speeds track the current `pipeSpeed`, every layer stays strictly less than the current pipe speed as the pipes ramp up through difficulty progression, preserving the parallax relationship (Requirements 12.7, 12.8, 15.6). Clouds wrap around when they exit the left edge so the background is continuous.

#### `collision`

```ts
function ghostHitbox(ghost: Ghost, config: GameConfig): Circle;    // { cx: ghost.x, cy: ghost.y, r: config.ghostHitboxRadius } (R19.4)
function pipeRects(pipe: PipePair, playArea: PlayArea): [Rect, Rect]; // top pipe, bottom pipe
function circleIntersectsRect(circle: Circle, rect: Rect): boolean; // strict (R19.5, R19.7)
function hitsGround(circle: Circle, playArea: PlayArea): boolean;   // cy + r > groundY (R19.6)
function hitsCeiling(circle: Circle, playArea: PlayArea): boolean;  // cy - r < ceilingY (R19.6)
function checkCollisions(ghost: Ghost, pipes: PipePair[], playArea: PlayArea, config: GameConfig): boolean; // R8.1-8.3
```

`circleIntersectsRect` clamps the centre to the rectangle and compares squared distances, with no square root:

```js
const px = clamp(c.cx, rect.x, rect.x + rect.width);
const py = clamp(c.cy, rect.y, rect.y + rect.height);
const dx = c.cx - px, dy = c.cy - py;
return dx * dx + dy * dy < c.r * c.r;   // equality = touching = no hit (R19.7)
```

`checkCollisions` returns true if the Hitbox intersects any top or bottom pipe rectangle, the ground, or the ceiling. It is called by `stepWorld` only in the `Playing` pipeline, after the Ghost and pipes have moved for that frame (Requirements 19.5, 19.6, 19.11). The Hitbox depends only on `ghost.x`, `ghost.y`, and `config.ghostHitboxRadius`; animation, rendering, and canvas scaling never change it (Requirement 19.4). The previous AABB helpers `ghostBounds` and `intersects` are removed because nothing else uses them; `Ghost.width`/`height` remain as the sprite cell size for rendering.

#### `scoring`

```ts
function updateScore(prev: World, next: World): { score: number; passed: Set<PipeId> };
```

A Pipe_Pair is counted once when the Ghost's x passes the pair's trailing edge and that pair's id is not already in the `passed` set (Requirement 7.1, 7.2). The `passed` set guarantees each pair scores exactly once per session.

#### `config`

```ts
const DEFAULT_CONFIG: GameConfig;
const CONFIG_SCHEMA: ConfigSchemaEntry[];

function validateConfig(config: GameConfig, schema: ConfigSchemaEntry[]): ConfigWarning[];
function resolveConfig(config: GameConfig, schema: ConfigSchemaEntry[]): { config: GameConfig; warnings: ConfigWarning[] };
function clampToSchema(key: string, value: number, schema: ConfigSchemaEntry[]): number;
function setConfigValue(config: GameConfig, key: string, value: number): GameConfig; // immutable, dotted key path
function serializeConfig(config: GameConfig): string;  // JS object literal, pasteable into config source
```

- `validateConfig` is pure and never throws. It returns one `ConfigWarning` per problem found:
  - any schema-tracked value outside its `[min, max]` range, or non-finite (Requirements 16.1, 16.2);
  - `maxPipeSpeed < basePipeSpeed`, with a warning naming both keys and values (Requirement 16.4);
  - any entry of `cloudLayerSpeedRatios` not strictly inside (0, 1), naming the layer index and ratio (Requirement 16.5);
  - fewer than 2 distinct values in `cloudLayerSpeedRatios` (Requirement 12.7);
  - `ghostHitboxRadius` greater than `min(ghostWidth, ghostHeight) / 2` (Requirement 19.8), in addition to its schema range check (8–16). A missing or non-numeric radius is reported like any other non-finite value.
  It returns an empty array when every value is valid (Requirement 16.6).
- `resolveConfig` is pure and never throws. It calls `validateConfig`, returns all its warnings, and returns a config that is the input unchanged **except** that a `ghostHitboxRadius` that is missing, non-numeric, below 8, above 16, or above `min(ghostWidth, ghostHeight) / 2` is replaced with the default `12` (Requirement 19.10). The warning for the rejected radius says it was replaced with 12. **This is the only value that is corrected:** every other invalid value is warned about and kept as-is, preserving today's warn-only behaviour (Requirement 16.3). The radius is special-cased because an out-of-range Hitbox silently changes collision fairness, whereas the other values are tuning guard-rails.
- `clampToSchema` returns `min(max(value, entry.min), entry.max)` for the schema entry with that key, and returns in-range values unchanged (Requirement 17.6).
- At load, the shell calls `resolveConfig(DEFAULT_CONFIG, CONFIG_SCHEMA)`, logs each warning with `console.warn` (key, current value, allowed range), uses the returned config as `currentConfig`, and continues into `Main_Menu` regardless (Requirements 16.2, 16.3, 16.6, 19.10).
- TuningPanel edits to `ghostHitboxRadius` go through `clampToSchema` (8–16). With the 32×32 default sprite, the upper bound 16 equals half the sprite size, so a clamped panel value always satisfies Requirement 19.8.

#### `animation` (presentation, pure)

```ts
function initialAnimState(): AnimState;   // Idle, frame 0, elapsedMs 0, rotationDeg 0
function stepAnimation(
  anim: AnimState,
  events: Effect[],        // effects returned by stepWorld this frame
  dtMs: number,            // same clamped delta as the simulation, in ms
  world: World,            // world AFTER stepWorld (read-only)
  config: GameConfig,
  reducedMotion: boolean,
): AnimState;
function frameVisual(anim: AnimState, reducedMotion: boolean): FrameVisual;
function velocityTilt(vy: number, physics: PhysicsConfig): number; // clamped lerp, degrees
```

`stepAnimation` never receives or returns a `World`, and `stepWorld` never receives an `AnimState`, so animation cannot change simulation state (Requirement 20.9). The loop owns `anim`. Rules, applied in this order each frame:

1. **Events.** `StateEntered Main_Menu` → `initialAnimState()` (Idle frame 0, rotation 0, opacity 1, normal eyes, no flash/shake; Requirement 20.13). `StateEntered Game_Over` → `Death` frame 0, `elapsedMs = 0`, `lockedRotationDeg = anim.rotationDeg` (the angle on the last Playing frame; Requirement 20.6). `FlapApplied` → `Flap` frame 0, `elapsedMs = 0`, discarding any remaining time of a running Flap (Requirements 20.2, 20.3). Event-triggered resets do not consume `dtMs` on that frame, so frame 0 is shown on the same rendered frame as the event.
2. **Pause.** If `world.state === "Paused"`, return the state unchanged: frame, `elapsedMs`, and rotation are frozen, and on resume only the remaining time of the frozen frame plays (Requirement 20.8).
3. **Advance.** Otherwise add `dtMs` to `elapsedMs` and move through the frame table below, carrying overflow into the next frame. Looping states wrap; one-shot states end (Flap → Glide frame 0; Death → hold frame).
4. **Rotation.** In `Playing` (Flap and Glide), `rotationDeg = velocityTilt(world.ghost.vy, config.physics)`. In Idle it is 0. In Death it stays at `lockedRotationDeg`.

`velocityTilt` is a linear interpolation from −20° at `flapVelocity` to +45° at `terminalVelocity`, clamped to [−20°, +45°]:

```js
const t = (vy - p.flapVelocity) / (p.terminalVelocity - p.flapVelocity);
return clamp(-20 + t * 65, -20, 45);   // vy = 0 with defaults → ≈ +5.4° (R20.5)
```

Frame tables (durations in ms; Requirements 20.1, 20.2, 20.6, 20.12):

| Kind | Frames (duration → visual) | End |
|---|---|---|
| Idle | 150 → offsetY 0; 150 → −2; 150 → 0; 150 → +2 | loop (600 ms cycle) |
| Flap | 60 → scale (1.1, 0.85) squash; 60 → (0.9, 1.1) stretch; 80 → (1, 1) settle | → Glide frame 0 |
| Glide | single frame, scale (1, 1) | until Flap or Game_Over |
| Death | 80 → flash; 120 → eyes cross; 60 → offsetX +2, cross; 60 → offsetX −2, cross | → hold: cross, offset 0, opacity 0.7 |

`frameVisual` maps the current frame to `{ offsetX, offsetY, scaleX, scaleY, rotationDeg, opacity, eyes, flash }`. With `reducedMotion = true` it returns Idle `offsetY = 0`, Death shake `offsetX = 0`, and `flash = false`, but keeps eyes, opacity, and the frame timing identical: reduced motion changes only what `frameVisual` returns, never how `stepAnimation` advances (Requirement 20.10). The Death animation plays in place because the simulation stops updating Ghost `y` in `Game_Over` (Requirements 8.5, 20.7).

**Flash safety (Requirement 20.11).** The only flash is the single 80 ms hit flash at the start of Death, and Death only starts on a `Playing → Game_Over` transition. Reaching `Game_Over` again requires going through `Main_Menu` and `Playing`, so there is at most one flash per death, and the 3-per-second limit holds by construction. No runtime rate limiter is needed.

#### `sprite` (pure helper)

```ts
function fitRect(srcW: number, srcH: number, cell: number): Rect;
// scale = min(cell / srcW, cell / srcH); w = srcW * scale; h = srcH * scale;
// returns { x: (cell - w) / 2, y: (cell - h) / 2, width: w, height: h }
```

For `ghosty.png` (1290×1567) and `cell = 32` this gives about 26.3×32, centred horizontally (Requirement 19.2). The shell's `prepareGhostSprite` uses it once at load.

### Shell

#### `InputController`

```ts
function drainInputBuffer(): InputFrame;   // see InputFrame in Data Models
function hitTest(p: Vec2, buttons: UiButton[], world: World): ButtonId | null; // logical coords, visible buttons only
```

Listens for `mousedown`, `touchstart`, and `keydown`. It sets flags in a buffer that is drained once per frame, so multiple raw events in one frame collapse to a single `InputFrame` (Requirement 3.6). It ignores any event whose `target` is inside the TuningPanel root element, so panel interactions never register as flaps (Requirement 17.9).

- **Pointer events.** The client position is converted to logical canvas coordinates, then hit-tested against the `UI_BUTTONS` visible in the current state. A hit on PLAY sets `playPressed`, HIGH_SCORES sets `highScoresPressed`, BACK sets `backPressed`, RESTART sets `restart`, and PAUSE/RESUME set `togglePause`. A pointer event that hits no button sets `pointer` (a generic click/tap). `stepWorld`, not the controller, decides what each flag means in the current state, so, for example, a generic `pointer` flaps in `Playing`, starts in `Main_Menu` with the panel closed, and is ignored with the panel open.
- **Keys.** Space → `startKey` and `flap`; Enter → `startKey` only (it never sets `flap`, so Enter does not flap in `Playing`); `P` → `togglePause`; `H` → `toggleBestScore`; `Escape` → `escape`; `M` → mute. Any `keydown` with `event.repeat === true` is ignored, so holding H or Escape opens/closes the panel at most once per physical press (Requirement 18.10).
- **Buttons.** `UI_BUTTONS` is a shell constant of logical rects, one per `ButtonId` (`PLAY`, `HIGH_SCORES`, `BACK`, `RESTART`, `RESUME`, `PAUSE`), each tagged with the states (and panel state) in which it is visible. Every rect is at least 44×44 logical px. When the canvas is displayed smaller than 480×640 (display scale `s < 1`, e.g. a narrow phone), the controller and renderer both use `displayRect(button, s)`, which grows each rect about its centre to at least `44 / s` logical px per side, so the displayed hit area stays at least 44×44 CSS px (Requirement 18.8). Button layout leaves enough spacing that grown rects still do not overlap at the smallest supported scale. PLAY and HIGH_SCORES do not overlap (Requirement 18.1). The Renderer draws from the same constant, so the drawn button and its hit area always match.

#### `Renderer`

```ts
function draw(world: World, visual: FrameVisual): void;
function prepareGhostSprite(image: HTMLImageElement | null, size = 32): HTMLCanvasElement; // once at load
```

Renders in logical coordinates scaled to the canvas with image smoothing disabled for a crisp pixel look (Requirement 12.1–12.4). Draws: sky, parallax cloud layers (semi-transparent, opacity 0.3–0.8), pipes, the Ghost sprite, the Score_Display ("Score: N | High: N"), and state overlays per `ui-mockups.md`: the title, PLAY and HIGH SCORES buttons and start prompt on `Main_Menu`; the Best_Score_Panel (BEST SCORE heading, `world.highScore`, BACK button) over the menu when `world.menu.bestScoreOpen` (Requirement 18.3); the pause button while `Playing`/`Paused`; the paused panel with RESUME; and the game-over panel with RESTART. Buttons come from `UI_BUTTONS`.

- **`prepareGhostSprite`.** Called once when `ghosty.png` loads. It creates a `size×size` offscreen canvas, sets `imageSmoothingEnabled = true` and `imageSmoothingQuality = "high"`, and draws the source into `fitRect(image.width, image.height, size)`: scale `min(32/w, 32/h)`, centred (Requirements 19.2, 19.3). The result is cached and reused for every frame in every state; the source image is never rescaled per frame. If `image` is `null` (load error, or not loaded 5 s after page open), it returns a 32×32 canvas with a filled white ghost-like shape fully inside the cell (Requirement 19.9).
- **Drawing the Ghost.** With `imageSmoothingEnabled = false`, the cell's top-left is `(Math.round(x − 16), Math.round(y − 16))` (Requirement 19.1). `visual` offsets, scale, rotation (about the cell centre), opacity, eye overlay (crosses), and flash tint are applied with `save()`/`restore()` around the blit only. Nothing here touches `World` or the Hitbox (Requirements 19.4, 20.9).

#### `AudioManager`

```ts
function apply(effects: Effect[]): void;   // handles PlaySound effects
function setMuted(muted: boolean): void;
```

Preloads `jump.wav` and `game_over.wav`. On a `PlaySound` effect it resets `currentTime` to 0 and plays (restart-on-replay, Requirement 13.3). Load/playback failures are caught and ignored (Requirement 13.4); when muted, playback is suppressed (Requirement 13.5).

#### `HighScoreStore`

```ts
function load(): number;                   // returns 0 on missing/invalid (R1.7, R1.8)
function apply(effects: Effect[]): void;    // handles PersistHighScore, swallows write errors (R9.4)
```

#### `TuningPanel`

```ts
function createTuningPanel(opts: {
  search: string;                               // location.search
  schema: ConfigSchemaEntry[];
  getConfig: () => GameConfig;
  setConfig: (next: GameConfig) => void;        // replaces loop's currentConfig
  parent: HTMLElement;                          // container over the canvas
}): TuningPanel | null;

interface TuningPanel {
  root: HTMLElement;
  toggle(): void;                               // bound to the "D" key
  contains(target: EventTarget | null): boolean; // used by InputController
}
```

- **Enablement.** Created only when `new URLSearchParams(search).get("debug") === "1"` (Requirement 17.1). Otherwise `createTuningPanel` returns `null`, no DOM is created, and no `D` key handler is registered, so `D` is ignored (Requirement 17.2).
- **Visibility.** Starts hidden. Pressing `D` toggles visibility (Requirement 17.3).
- **Controls.** Plain DOM: one row per schema entry with `panel: true`, each with a linked `<input type="range">` and `<input type="number">` using the entry's `min`, `max`, `step`, and a `<label>` from `label` (Requirement 17.4). The panel is absolutely positioned over the canvas. Adding a new tunable to the panel only needs a schema entry.
- **Applying edits.** On `input`/`change`, the value is clamped with `clampToSchema`, both inputs are synced to the clamped value, and `setConfig(setConfigValue(getConfig(), key, clamped))` replaces `currentConfig` immutably. `setConfigValue` is a pure helper in `config` that copies along the dotted key path (e.g. `physics.gravity` produces a new `physics` object), so the previous config object is never mutated. The next `stepWorld` call uses it; the world is not reset (Requirements 17.5, 17.6, 17.10).
- **Copy.** A "Copy config" button serializes `currentConfig` as a JS object literal (`serializeConfig(config)`, pure; e.g. `export const DEFAULT_CONFIG = { ... };`) and writes it with `navigator.clipboard.writeText`. If the clipboard API is missing or the promise rejects, it shows a `<textarea>` with the text, selected, for manual copying (Requirement 17.7).
- **No persistence.** Nothing is written to localStorage or the URL. A reload starts from `DEFAULT_CONFIG` (Requirement 17.8).
- **Input isolation.** Panel `mousedown`, `touchstart`, `click`, and `keydown` listeners call `stopPropagation()`, and `InputController` also ignores events whose target is inside `panel.root`, so typing a space or clicking a slider never flaps (Requirement 17.9).

## Data Models

All simulation state lives in a single immutable `World` object that `stepWorld` reads and returns a new version of.

```ts
type GameState = "Main_Menu" | "Playing" | "Paused" | "Game_Over";

interface Vec2 { x: number; y: number; }

interface Ghost {
  x: number;        // fixed at 30% of play width (R1.3, R4.4)
  y: number;        // vertical position, logical pixels
  vy: number;       // vertical velocity, logical px/s
  width: number;    // sprite cell width, 24-48, default 32 (R12.1); rendering only, not collision
  height: number;   // sprite cell height, 24-48, default 32 (R12.1); rendering only, not collision
}

interface PipePair {
  id: number;           // unique per pair, for score dedup (R7.2)
  x: number;            // left edge, logical px
  width: number;        // 40-80 (R12.2)
  gapY: number;         // top of the Gap
  gapHeight: number;    // fixed Gap size (R6.4)
  scored: boolean;      // whether this pair has been counted (R7.2)
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  layer: number;        // depth index; >= 2 distinct layers (R12.7)
  opacity: number;      // 0.3-0.8 (R12.6)
}

interface Rect { x: number; y: number; width: number; height: number; }

// Ghost Hitbox (R19.4). Centre = Ghost (x, y); radius = config.ghostHitboxRadius.
interface Circle { cx: number; cy: number; r: number; }

interface PlayArea { width: number; height: number; groundY: number; ceilingY: number; }

interface PhysicsConfig {
  gravity: number;          // 1600 (R14.1)
  flapVelocity: number;     // -450, within mandated -400..-500 (R3.4, R14.2)
  terminalVelocity: number; // 700 (R14.3)
}

// Single source of truth for all gameplay tuning values. Every numeric
// gameplay constant lives here (no magic numbers scattered in the code),
// and each field carries the requirement-mandated bound it must satisfy.
// GameConfig is defined in the pure `config` module and consumed by both
// the core (to seed the initial World) and the shell (for layout/rendering).
interface GameConfig {
  physics: PhysicsConfig;       // gravity / flap / terminal (R14.1-14.3)

  // Pipes + difficulty progression
  basePipeSpeed: number;        // Base_Pipe_Speed: starting speed at Playing start (R6.1, R15.1)
  maxPipeSpeed: number;         // Max_Pipe_Speed: cap the evolving speed never exceeds (R15.3, R15.4)
  speedStep: number;            // Speed_Step: increment added per threshold crossing (R15.2)
  speedUpInterval: number;      // Score points per difficulty threshold, e.g. 5 (R15.2)
  spawnDistance: number;        // fixed horizontal spacing between pairs (R6.2)
  gapHeight: number;            // fixed Gap size, kept inside play area, unchanged by progression (R6.4, R15.7)
  pipeWidth: number;            // 40-80 (R12.2)

  // Clouds
  // Layer speeds are stored as fractions of the CURRENT pipeSpeed rather than
  // absolute values. Because pipeSpeed evolves with difficulty (R15), a ratio
  // in (0, 1) guarantees each layer stays strictly below the current pipe
  // speed at every speed after every increase, cleanly preserving R12.8/R15.6.
  cloudLayerSpeedRatios: number[]; // >= 2 distinct values, each in (0, 1); effective speed = ratio * current pipeSpeed (R12.7, R12.8, R15.6)
  cloudCount: number;           // 1-10 (R12.3); bounds live in CONFIG_SCHEMA
  cloudOpacityMin: number;      // 0.3 (R12.6)
  cloudOpacityMax: number;      // 0.8 (R12.6)

  // Ghost
  ghostWidth: number;           // sprite cell, 24-48, default 32 (R12.1, R19.1)
  ghostHeight: number;          // sprite cell, 24-48, default 32 (R12.1, R19.1)
  ghostHitboxRadius: number;    // circle Hitbox radius, 8-16 and <= min(ghostWidth, ghostHeight)/2, default 12 (R19.4, R19.8, R19.10)
  ghostStartXRatio: number;     // 0.3 of play width (R1.3, R4.4)
  ghostStartYRatio: number;     // 0.5 of play height (R1.3)

  // Score display
  scoreFontSize: number;        // 16-48 (R12.4); bounds live in CONFIG_SCHEMA
}

// One entry per validated tunable. `key` is a dotted path into GameConfig
// (e.g. "physics.gravity"). `panel: true` makes the TuningPanel generate a
// control for it (R17.4), so adding a tunable only needs a schema entry.
interface ConfigSchemaEntry {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  panel: boolean;
}

// Returned by validateConfig; the shell logs each with console.warn (R16.2).
interface ConfigWarning {
  key: string;          // e.g. "physics.flapVelocity", "maxPipeSpeed", "cloudLayerSpeedRatios[1]"
  value: unknown;       // current setting (a number, or both values for cross-field checks)
  message: string;      // human-readable, includes the allowed range or violated relation
}

interface World {
  state: GameState;
  ghost: Ghost;
  pipes: PipePair[];
  clouds: Cloud[];
  score: number;
  highScore: number;
  playArea: PlayArea;
  pipeSpeed: number;        // CURRENT (evolving) shared Pipe_Speed; init = basePipeSpeed, grows with score up to maxPipeSpeed, > every current cloud layer speed (R6.1, R12.8, R15.1-15.5)
  speedTier: number;        // number of Speed_Step increases already applied = min(floor(score / speedUpInterval), maxTier); tracked so each threshold is applied exactly once (idempotent, deterministic) (R15.2, R15.4, R15.5)
  rng: RNG;                 // deterministic PRNG state
  muted: boolean;
  menu: MenuState;          // Main_Menu UI sub-state; closed on every entry into Main_Menu (R18.9)
}

interface MenuState {
  bestScoreOpen: boolean;   // Best_Score_Panel open? Only meaningful while state === "Main_Menu" (R18)
}

// The initial World is built from a GameConfig rather than from inline
// literals, so constants have exactly one definition and tests can pass
// an alternate config. `highScore` comes from the shell's HighScoreStore;
// `rng` is a seeded PRNG so the initial layout is reproducible.
function createInitialWorld(
  config: GameConfig,
  playArea: PlayArea,
  highScore: number,
  rng: RNG,
): World; // state = "Main_Menu"; ghost sized/positioned from config; no pipes; config.cloudCount clouds seeded within the config opacity range; pipeSpeed = config.basePipeSpeed and speedTier = 0 (R15.1); menu.bestScoreOpen = false (R18.9); no tuning values copied into World

// Deterministic PRNG so pipe generation is reproducible in tests
interface RNG { next(): { value: number; rng: RNG }; }  // value in [0, 1)

// Input consolidated once per frame. The controller only reports what happened;
// stepWorld decides what it means in the current Game_State / panel state.
interface InputFrame {
  flap: boolean;              // Space, or a click/tap that hit no button (flaps only in Playing, R3)
  pointer: boolean;           // a click/tap that hit no button
  startKey: boolean;          // Space or Enter (start in Main_Menu R2.1; restart in Game_Over R10.2). Enter never sets flap.
  playPressed: boolean;       // PLAY button hit (R18.7)
  highScoresPressed: boolean; // HIGH SCORES button hit (R18.2)
  backPressed: boolean;       // BACK button hit (R18.4)
  toggleBestScore: boolean;   // H key, non-repeat (R18.2, R18.4, R18.10)
  escape: boolean;            // Escape key, non-repeat (R18.4, R18.10)
  togglePause: boolean;       // P key or PAUSE/RESUME button (R5.1, R5.4)
  restart: boolean;           // RESTART button hit (R10.2)
}

type ButtonId = "PLAY" | "HIGH_SCORES" | "BACK" | "RESTART" | "RESUME" | "PAUSE";

// Shell constant; logical coordinates; width/height >= 44 (R18.8)
interface UiButton { id: ButtonId; rect: Rect; visibleIn: (world: World) => boolean; label: string; }

// Side effects and presentation events requested by the pure core
type Effect =
  | { type: "PlaySound"; sound: "jump" | "gameOver" }
  | { type: "PersistHighScore"; value: number }
  | { type: "FlapApplied" }                                            // every applied Flap, incl. the first on start (R20.2, R20.3)
  | { type: "StateEntered"; state: "Playing" | "Paused" | "Game_Over" | "Main_Menu" }; // R20.6, R20.8, R20.13

// Ghost_Animation state, owned by the loop, never stored in World (R20.9)
type AnimKind = "Idle" | "Flap" | "Glide" | "Death";
interface AnimState {
  kind: AnimKind;
  frame: number;              // index into the frame table for `kind`; Death uses 4 = hold
  elapsedMs: number;          // time spent in the current frame
  rotationDeg: number;        // current sprite rotation
  lockedRotationDeg?: number; // set on entering Death; rotation stays fixed (R20.6)
}

// Pure mapping of AnimState to render parameters
interface FrameVisual {
  offsetX: number;            // Death shake ±2 (0 with reduced motion)
  offsetY: number;            // Idle bob -2..+2 (0 with reduced motion)
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  opacity: number;            // 1.0, or 0.7 on the Death hold frame
  eyes: "normal" | "cross";
  flash: boolean;             // Death frame 0 only (false with reduced motion)
}
```

Input mapping in `stepWorld` (all other combinations are ignored):

| State / panel | Input | Result |
|---|---|---|
| Main_Menu, closed | `highScoresPressed` or `toggleBestScore` | open panel; no start, no flap (R18.2, R18.6) |
| Main_Menu, closed | `startKey`, `playPressed`, or `pointer` | → Playing, score 0, first Flap (R2.1–2.3, R18.7) |
| Main_Menu, open | `backPressed`, `escape`, or `toggleBestScore` | close panel; no start, no flap (R18.4, R18.11) |
| Main_Menu, open | anything else | no change (R18.5) |
| Playing | `flap` | Flap (R3); Enter alone does nothing |
| Playing / Paused | `togglePause` | toggle pause (R5.1, R5.4) |
| Game_Over | `pointer`, `startKey`, or `restart` | → Main_Menu, panel closed (R10.2, R18.9) |

When several flags arrive in the same frame in `Main_Menu`, panel inputs win over start inputs, so a frame containing a High Scores/H input never starts the game (R18.6).

`World` holds simulation state only. It carries no copy of `physics`, `spawnDistance`, or any other tuning value; those are read from the `config` argument of `stepWorld` on every frame.

Example `DEFAULT_CONFIG` and `CONFIG_SCHEMA`. The physics defaults and threshold interval equal the values in R14.1–14.3 and R15.2, as R16.7 requires.

```js
export const DEFAULT_CONFIG = {
  physics: {
    gravity: 1600,            // R14.1
    flapVelocity: -450,       // R14.2 (within R3.4's -500..-400)
    terminalVelocity: 700,    // R14.3
  },
  basePipeSpeed: 160,
  maxPipeSpeed: 280,
  speedStep: 20,
  speedUpInterval: 5,         // R15.2
  gapHeight: 160,
  spawnDistance: 220,
  pipeWidth: 60,
  cloudLayerSpeedRatios: [0.2, 0.4],
  cloudCount: 6,
  cloudOpacityMin: 0.3,
  cloudOpacityMax: 0.8,
  ghostWidth: 32,             // R12.1, R19.1
  ghostHeight: 32,            // R12.1, R19.1
  ghostHitboxRadius: 12,      // R19.4, R19.10
  ghostStartXRatio: 0.3,
  ghostStartYRatio: 0.5,
  scoreFontSize: 20,
};

// R = bound taken from a requirement; G = developer guard-rail (no requirement bound).
export const CONFIG_SCHEMA = [
  { key: "physics.gravity",          label: "Gravity",           min: 400,  max: 4000, step: 10,   panel: true  }, // G
  { key: "physics.flapVelocity",     label: "Flap velocity",     min: -500, max: -400, step: 5,    panel: true  }, // R3.4
  { key: "physics.terminalVelocity", label: "Terminal velocity", min: 200,  max: 1500, step: 10,   panel: true  }, // G
  { key: "basePipeSpeed",            label: "Base pipe speed",   min: 60,   max: 400,  step: 5,    panel: true  }, // G
  { key: "maxPipeSpeed",             label: "Max pipe speed",    min: 60,   max: 600,  step: 5,    panel: true  }, // G
  { key: "speedStep",                label: "Speed step",        min: 0,    max: 100,  step: 1,    panel: true  }, // G
  { key: "speedUpInterval",          label: "Speed-up interval", min: 1,    max: 50,   step: 1,    panel: true  }, // G
  { key: "gapHeight",                label: "Gap height",        min: 100,  max: 300,  step: 5,    panel: true  }, // G
  { key: "spawnDistance",            label: "Spawn distance",    min: 150,  max: 400,  step: 5,    panel: true  }, // G
  { key: "pipeWidth",                label: "Pipe width",        min: 40,   max: 80,   step: 1,    panel: false }, // R12.2
  { key: "ghostWidth",               label: "Ghost width",       min: 24,   max: 48,   step: 1,    panel: false }, // R12.1
  { key: "ghostHeight",              label: "Ghost height",      min: 24,   max: 48,   step: 1,    panel: false }, // R12.1
  { key: "ghostHitboxRadius",        label: "Hitbox radius",     min: 8,    max: 16,   step: 1,    panel: true  }, // R19.8
  { key: "cloudCount",               label: "Cloud count",       min: 1,    max: 10,   step: 1,    panel: false }, // R12.3
  { key: "cloudOpacityMin",          label: "Cloud opacity min", min: 0.3,  max: 0.8,  step: 0.05, panel: false }, // R12.6
  { key: "cloudOpacityMax",          label: "Cloud opacity max", min: 0.3,  max: 0.8,  step: 0.05, panel: false }, // R12.6
  { key: "scoreFontSize",            label: "Score font size",   min: 16,   max: 48,   step: 1,    panel: false }, // R12.4
];
// cloudLayerSpeedRatios is checked by validateConfig directly rather than by a
// schema range, because its bound is exclusive: each ratio must be in (0, 1)
// (R12.8, R15.6, R16.5), and there must be at least 2 distinct ratios (R12.7).
// ghostHitboxRadius also has a cross-field check in validateConfig:
// radius <= min(ghostWidth, ghostHeight) / 2 (R19.8). resolveConfig replaces an
// invalid radius with 12 (R19.10); all other invalid values stay warn-only (R16.3).
```

The requirement-derived ranges are hard rules; the guard-rail ranges (marked G) have no requirement bound and exist only to keep live tuning inside values where the game still plays sensibly. Guard-rails can be widened by editing the schema. `DEFAULT_CONFIG` sits inside every range, satisfies `maxPipeSpeed ≥ basePipeSpeed`, and has `ghostHitboxRadius = 12 ≤ 32 / 2`, so `validateConfig(DEFAULT_CONFIG, CONFIG_SCHEMA)` returns no warnings (R16.6) and `resolveConfig` returns it unchanged.

Notes:

- The `World` is treated as immutable; `stepWorld` returns a fresh object. This keeps the core pure and makes property tests trivial to run repeatedly.
- `rng` is threaded through the world so pipe placement is deterministic given a seed — essential for reproducible property tests of spawning and for debugging.
- `GameConfig` (not `World`) is the source of truth for tuning values. `createInitialWorld` uses the config only to seed initial simulation state (the initial `pipeSpeed` = `basePipeSpeed` with `speedTier` = 0, the Ghost size/position from `ghostWidth`/`ghostHeight` and the start ratios, and clouds from `cloudCount` and the opacity range); it copies no tuning values into `World`. `stepWorld(world, input, dt, config)` reads all tuning values from its `config` argument each frame, so the core stays a pure function of its arguments and live Tuning_Panel edits apply on the next frame. `PhysicsConfig` is kept as a sub-part of `GameConfig` (`config.physics`) and is passed to `integrate(ghost, dt, config.physics)`, so the existing physics signatures continue to make sense.
- Each `PipePair` stores its own `gapHeight`, captured from `config.gapHeight` at spawn. This is simulation state (the shape of an existing obstacle), not a tuning copy, and is what lets gap edits apply to new pipes only.
- **Structural constants are separate from `GameConfig`.** Values that are not gameplay tuning knobs are defined as shell-level constants rather than fields of `GameConfig`:
  - `STORAGE_KEY` — the localStorage key for the persisted High_Score (R9.3, R1.6).
  - `ASSET_PATHS` — `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav` (R12.1, R13.1, R13.2).
  - `MAX_DT` — the delta-time clamp, e.g. 1/30 s (R8, R12.5).
  - `LOGICAL_WIDTH` / `LOGICAL_HEIGHT` — the fixed logical resolution, e.g. 480×640, from which `PlayArea` is derived.
  - `UI_BUTTONS` — logical rects for PLAY, HIGH_SCORES, BACK, RESTART, RESUME, PAUSE, each ≥ 44×44 (R18.1, R18.8), shared by the InputController and the Renderer.
  - `SPRITE_LOAD_TIMEOUT_MS` — 5000, after which the fallback Ghost shape is used (R19.9).
  These are not part of `World` and are not gameplay tuning, so they live with the shell that owns the corresponding browser APIs.
- `World.menu` is UI state of the simulation (it decides whether an input starts the game), so it lives in `World`. `AnimState` is presentation only and lives outside `World` in the loop, so none of the simulation properties see it.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

These properties target the **pure core** (`stepWorld`, `physics`, `pipes`, `clouds`, `collision`, `scoring`, `config`, and the presentation-only `animation` and `sprite` helpers) and the pure loader/formatter functions. Wherever a property mentions a tuning value, it comes from the `config` argument passed to `stepWorld` or the function under test, not from `World`. Rendering appearance, latency bounds, and external-service behavior are covered by unit/integration tests in the Testing Strategy instead. Properties were consolidated during prework reflection to remove redundancy.

### Property 1: Flap sets a fixed velocity regardless of prior velocity

*For any* Ghost with any prior vertical velocity and any config whose `physics.flapVelocity` is within the schema range, applying a Flap sets the Ghost vertical velocity to exactly `config.physics.flapVelocity` (−450 in `DEFAULT_CONFIG`), so no momentum accumulates across consecutive Flaps.

**Validates: Requirements 3.4, 14.2**

### Property 2: Single-step physics integration

*For any* Ghost, any `Delta_Time` dt ≥ 0, any config with physics values inside the schema ranges, and no Flap on that frame, integration produces `vy' = min(vy + config.physics.gravity · dt, config.physics.terminalVelocity)` and `y' = y + vy' · dt`, and leaves `x` unchanged. In particular `vy'` never exceeds `config.physics.terminalVelocity`.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 14.1, 14.3, 14.4, 14.5**

### Property 3: Frame-rate independence of motion

*For any* Ghost and any `Delta_Time` dt split into N equal sub-steps, integrating the single step of dt and integrating the N sub-steps summing to dt produce approximately equal final position and velocity (within a small numerical tolerance), so motion is consistent regardless of frame rate.

**Validates: Requirements 12.5, 14.6**

### Property 4: Flap only applies while Playing

*For any* world whose state is not `Playing` (`Main_Menu`, `Paused`, or `Game_Over`), a flap input never sets the Ghost vertical velocity to `Flap_Velocity` as a flap and never emits a jump `PlaySound` or `FlapApplied` effect. (Note: the `Main_Menu → Playing` transition applies the first Flap as part of the transition, not as an in-`Playing` flap.)

**Validates: Requirements 3.5, 5.5**

### Property 5: Consecutive flap inputs in one frame apply exactly one Flap

*For any* number of raw flap events buffered within a single frame, draining them yields a single `flap = true` `InputFrame`, and stepping applies at most one Flap and emits at most one jump `PlaySound` effect for that frame.

**Validates: Requirements 3.6**

### Property 6: Start transition resets score and applies first flap

*For any* `Main_Menu` world with the Best_Score_Panel closed and any prior score, and any start input (`startKey` from Space or Enter, `playPressed`, or a generic `pointer`) with no panel input in the same frame, stepping transitions the world to `Playing`, sets the score to 0, sets the Ghost vertical velocity to `config.physics.flapVelocity` from the config passed to `stepWorld`, and emits `FlapApplied` and `PlaySound "jump"`.

**Validates: Requirements 2.1, 2.2, 2.3, 18.7, 20.2**

### Property 7: Pause is a no-op on the simulation

*For any* `Paused` world and any `Delta_Time`, stepping the world leaves the Ghost position and velocity, all Pipe_Pairs, all clouds, and the score identical.

**Validates: Requirements 5.2, 5.3**

### Property 8: Pause/resume round-trip preserves the world

*For any* `Playing` world W, toggling pause (→ `Paused`) and then toggling again (→ `Playing`) yields a world equal to W in Ghost position/velocity, Pipe_Pairs, clouds, and score.

**Validates: Requirements 5.1, 5.4**

### Property 9: Pipes scroll left at the single current shared speed

*For any* set of Pipe_Pairs, any current shared `pipeSpeed`, and any `Delta_Time`, after scrolling every pair's x decreases by exactly `pipeSpeed · dt`, identically for every pair — so all pairs always move at one common speed even as that speed changes over the run.

**Validates: Requirements 6.1, 15.5**

### Property 10: New pipes spawn at fixed spacing with an in-bounds Gap

*For any* deterministic RNG seed and any config inside the schema ranges, each spawned Pipe_Pair has `gapHeight` equal to `config.gapHeight` at spawn time, has its Gap fully inside the play area (`gapY ≥ ceiling` and `gapY + gapHeight ≤ groundY`), and consecutive spawned pairs are separated by `config.spawnDistance`. Changing `config.gapHeight` leaves the `gapHeight` of already-spawned pairs unchanged.

**Validates: Requirements 6.2, 6.4**

### Property 11: Off-screen pipes are culled, others retained

*For any* set of Pipe_Pairs, culling removes exactly the pairs fully past the left edge (`x + width < 0`) and retains every other pair unchanged.

**Validates: Requirements 6.5**

### Property 12: Each pipe is scored exactly once

*For any* sequence of `Playing` steps, the score equals the number of distinct Pipe_Pairs whose trailing edge the Ghost has passed, and re-stepping never increments the score for a pair already counted.

**Validates: Requirements 7.1, 7.2**

### Property 13: Any collision ends the game

*For any* `Playing` world and config, after the frame's movement, if the Ghost Hitbox `ghostHitbox(ghost, config)` (centre `(x, y)`, radius `config.ghostHitboxRadius`) satisfies `circleIntersectsRect` with any top or bottom pipe rectangle, or `y + r > groundY`, or `y − r < ceilingY`, stepping transitions the world to `Game_Over`; if none of these hold (including exact contact `y + r == groundY` or `y − r == ceilingY`), it does not. *For any* world in `Main_Menu`, `Paused`, or `Game_Over`, no Ghost overlap with a pipe, the Ground, or the Ceiling ever causes a transition to `Game_Over`.

**Validates: Requirements 8.1, 8.2, 8.3, 19.4, 19.6, 19.7, 19.11**

### Property 14: Game_Over freezes the world

*For any* `Game_Over` world and any `Delta_Time`, stepping leaves every Pipe_Pair's horizontal position unchanged and leaves the Ghost vertical position unchanged.

**Validates: Requirements 8.4, 8.5**

### Property 15: High score becomes the maximum on Game_Over

*For any* `Playing` world with score S and high score H, transitioning to `Game_Over` sets the high score to `max(S, H)` (increasing it only when S > H), and emits a `PersistHighScore` effect with that integer value exactly when the high score increased.

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 16: Restart resets to a clean Main_Menu

*For any* `Game_Over` world, a click/tap (`pointer`), `startKey` (Space or Enter), or restart input transitions the world to `Main_Menu` with the Ghost at its starting position, Ghost vertical velocity 0, no active Pipe_Pairs, and score 0.

**Validates: Requirements 10.2, 10.3, 10.4, 10.5**

### Property 17: Stored high score always loads as a valid non-negative integer

*For any* string value present in Storage (including missing, empty, non-numeric, negative, fractional, or out-of-range values), loading the high score returns a non-negative integer within [0, 999,999,999] and never throws, returning 0 for any invalid value.

**Validates: Requirements 1.5, 1.7, 1.8**

### Property 18: Score display round-trips non-negative integers

*For any* non-negative integer current score and high score, the formatted Score_Display text ("Score: N | High: M") contains values that parse back to exactly those integers.

**Validates: Requirements 11.2, 11.3**

### Property 19: Cloud generation stays within opacity bounds

*For any* deterministic RNG seed, every generated cloud has an opacity within [0.3, 0.8].

**Validates: Requirements 12.6**

### Property 20: Parallax layers are distinct and slower than the current pipe speed

*For any* cloud configuration and any current `pipeSpeed`, there are at least two distinct layer ratios, every cloud's horizontal speed equals `ratio · pipeSpeed` for its layer, and every resulting layer speed is strictly less than the current `pipeSpeed`.

**Validates: Requirements 12.7, 12.8**

### Property 21: Sound effects are emitted on flap and on game over

*For any* step in which a Flap is applied while `Playing`, the returned effects include a `PlaySound "jump"`; and *for any* step that transitions `Playing → Game_Over`, the returned effects include a `PlaySound "gameOver"`.

**Validates: Requirements 13.1, 13.2**

### Property 22: Muting suppresses all sound playback

*For any* list of `PlaySound` effects, when the AudioManager is muted, applying those effects invokes no audio playback.

**Validates: Requirements 13.5**

### Property 23: Pipe speed is a monotone, stepped, capped function of score

*For any* non-negative integer score, `targetPipeSpeed(score, cfg)` equals `min(basePipeSpeed + floor(score / speedUpInterval) · speedStep, maxPipeSpeed)`. In particular it equals `basePipeSpeed` at score 0, is monotonically non-decreasing in score, increases by exactly `speedStep` each time the score crosses a `speedUpInterval` boundary (until the cap), and never exceeds `maxPipeSpeed`.

**Validates: Requirements 15.1, 15.2, 15.3, 15.4**

### Property 24: Applying difficulty is idempotent and yields one shared speed

*For any* `Playing` world, `applyDifficulty` sets `pipeSpeed` to `targetPipeSpeed(score, cfg)`, and applying it again for the same score leaves `pipeSpeed` unchanged (idempotent). After the update, scrolling uses that single `pipeSpeed` for every active Pipe_Pair, so all pairs share one common speed.

**Validates: Requirements 15.5**

### Property 25: Every cloud layer stays strictly below any reachable pipe speed

*For any* current `pipeSpeed` in the reachable range `[basePipeSpeed, maxPipeSpeed]` and any configured layer ratios (each in (0, 1)), every layer's effective speed `ratio · pipeSpeed` is strictly less than `pipeSpeed`, so the parallax relationship holds after every difficulty increase.

**Validates: Requirements 15.6, 12.8**

### Property 26: Valid configs produce no warnings

*For any* config generated with every schema-tracked value inside its `[min, max]` range, `maxPipeSpeed ≥ basePipeSpeed`, at least two distinct `cloudLayerSpeedRatios` each strictly inside (0, 1), and `ghostHitboxRadius ≤ min(ghostWidth, ghostHeight) / 2` — including `DEFAULT_CONFIG` itself — `validateConfig(config, CONFIG_SCHEMA)` returns an empty array.

**Validates: Requirements 16.1, 16.6, 16.7**

### Property 27: Invalid config values are reported by key and never throw

*For any* otherwise-valid config modified to contain a schema value outside its range (including non-finite values), `maxPipeSpeed < basePipeSpeed`, a cloud ratio ≤ 0 or ≥ 1, or `ghostHitboxRadius > min(ghostWidth, ghostHeight) / 2`, `validateConfig` returns at least one warning whose `key` names the offending value (both `maxPipeSpeed` and `basePipeSpeed` for the cross-field case, the ratio index for a bad cloud ratio) and whose `value` is the current setting. *For any* input, `validateConfig` never throws.

**Validates: Requirements 16.2, 16.3, 16.4, 16.5, 19.8**

### Property 28: Clamping stays in range and preserves in-range values

*For any* schema entry and any finite number v, `clampToSchema(key, v, schema)` returns a value in `[min, max]`, and returns v unchanged when v is already in `[min, max]`.

**Validates: Requirements 17.6**

### Property 29: Config serialization round-trips

*For any* valid config, parsing the output of `serializeConfig(config)` as a JS object literal yields a config deeply equal to the original.

**Validates: Requirements 17.7**

### Property 30: stepWorld uses the config passed in each call without resetting the session

*For any* `Playing` world and any two configs A and B that differ only in physics values, `stepWorld(world, input, dt, B)` integrates the Ghost with B's gravity, flap velocity, and terminal velocity (matching Property 2 evaluated with B), and leaves `state`, `score`, and the set of Pipe_Pair ids unchanged compared with `stepWorld(world, input, dt, A)` whenever neither step causes a collision.

**Validates: Requirements 17.5, 17.10**

### Property 31: Circle-vs-rect collision matches the geometric definition

*For any* circle (any centre, radius in [8, 16]) and any rectangle with non-negative width and height, `circleIntersectsRect(circle, rect)` returns true exactly when a brute-force reference, the minimum Euclidean distance from the centre to the closed rectangle (0 if the centre is inside), is strictly less than `r`. *For any* rectangle and radius, a circle whose centre is placed at distance exactly `r` from the rectangle (generated axis-aligned beside an edge, where the arithmetic is exact) returns false.

**Validates: Requirements 8.1, 8.2, 8.3, 19.5, 19.6, 19.7**

### Property 32: Invalid Hitbox radius resolves to the default; other values are untouched

*For any* otherwise-valid config, `resolveConfig(config, CONFIG_SCHEMA)` returns the config unchanged with no radius warning when `ghostHitboxRadius` is valid; and when `ghostHitboxRadius` is missing, non-numeric, below 8, above 16, or above `min(ghostWidth, ghostHeight) / 2`, it returns a config with `ghostHitboxRadius === 12`, every other field deeply equal to the input, and a warning whose `key` is `ghostHitboxRadius` and whose `value` is the rejected value. *For any* config with some other invalid value, `resolveConfig` keeps that value unchanged and still reports it (warn-only). It never throws.

**Validates: Requirements 16.3, 19.8, 19.10**

### Property 33: Sprite fitting is uniform, fills the longer side, and is centred

*For any* positive source width and height and cell size 32, `fitRect(srcW, srcH, 32)` returns a rect whose width and height equal `srcW · s` and `srcH · s` for the single factor `s = min(32 / srcW, 32 / srcH)`, whose longer side equals 32 and shorter side is ≤ 32, whose width-to-height ratio matches `srcW / srcH` within 1 px after rounding, and which is centred in the cell (`x = (32 − width) / 2`, `y = (32 − height) / 2`).

**Validates: Requirements 19.2**

### Property 34: Animation never changes the simulation

*For any* initial world, config, and sequence of `(InputFrame, dt)` pairs, the sequence of worlds and effects produced by `stepWorld` alone is identical to the sequence produced when `stepAnimation` and `frameVisual` are also run after every step, with either value of `reducedMotion`. In particular the Ghost position, velocity, and `ghostHitbox` are identical on every frame.

**Validates: Requirements 19.4, 20.9**

### Property 35: Rotation is a clamped linear function of vertical velocity

*For any* vertical velocity `vy` and any physics config within the schema ranges, `velocityTilt(vy, physics)` equals `clamp(−20 + 65 · (vy − flapVelocity) / (terminalVelocity − flapVelocity), −20, 45)`, lies in [−20, 45], is non-decreasing in `vy`, returns −20 at `flapVelocity` and 45 at `terminalVelocity`, and (for any `Playing` world) `stepAnimation` sets `rotationDeg` to this value within 0.5°.

**Validates: Requirements 20.5**

### Property 36: Every Flap restarts the Flap animation from frame 0

*For any* `AnimState` (any kind, frame, and elapsed time) and any `dtMs`, stepping with a `FlapApplied` event in `Playing` yields `kind = "Flap"`, `frame = 0`, `elapsedMs = 0`; and *for any* subsequent sequence of `dtMs` values with no further events, the animation shows frames 0, 1, 2 for 60, 60, and 80 ms of accumulated time and is `Glide` once accumulated time reaches 200 ms.

**Validates: Requirements 20.2, 20.3, 20.4**

### Property 37: Frame tables drive Idle and Death timing

*For any* sequence of non-negative `dtMs` values with accumulated time `T` and no events: starting from Idle frame 0 in `Main_Menu`, the frame index is `floor(T / 150) mod 4` and the visual `offsetY` follows [0, −2, 0, +2] with rotation 0; starting from `StateEntered Game_Over` with any prior rotation ρ, the phase at time `T` is flash for `T < 80`, crosses for `80 ≤ T < 200`, shake +2 for `200 ≤ T < 260`, shake −2 for `260 ≤ T < 320`, and the hold frame (crossed eyes, offset 0, opacity 0.7) for `T ≥ 320`, with `rotationDeg = ρ` throughout. At most one frame sequence with `flash = true` occurs per `Game_Over` entry.

**Validates: Requirements 20.1, 20.6, 20.11, 20.12**

### Property 38: Pausing freezes the animation state

*For any* `AnimState` and any `dtMs`, when the world is `Paused` and no events occur, `stepAnimation` returns an `AnimState` equal to its input (same kind, frame, `elapsedMs`, and rotation). Resuming then continues from the frozen `elapsedMs`, so the frozen frame lasts only its remaining time.

**Validates: Requirements 20.8**

### Property 39: Reduced motion removes motion and flash but not timing

*For any* `AnimState`, `frameVisual(anim, true)` has `offsetX = 0`, `offsetY = 0`, and `flash = false`, and equals `frameVisual(anim, false)` in `eyes`, `opacity`, `scaleX`, `scaleY`, and `rotationDeg`. *For any* sequence of events and `dtMs` values, `stepAnimation` produces identical `AnimState` sequences with `reducedMotion` true and false.

**Validates: Requirements 20.10**

### Property 40: Entering Main_Menu resets the animation to Idle frame 0

*For any* `AnimState`, stepping with a `StateEntered Main_Menu` event yields `kind = "Idle"`, `frame = 0`, `elapsedMs = 0`, `rotationDeg = 0`, and `frameVisual` gives opacity 1.0, normal eyes, `flash = false`, and `offsetX = 0`.

**Validates: Requirements 20.13**

### Property 41: The Best_Score_Panel never starts a game or flaps

*For any* `Main_Menu` world and any `InputFrame`: if the panel is open, or the frame contains `highScoresPressed` or (with the panel closed) `toggleBestScore`, then stepping leaves the state as `Main_Menu`, leaves the Ghost, pipes, and score unchanged, and emits no `FlapApplied`, `PlaySound "jump"`, or `StateEntered "Playing"` effect. If the panel is open and the frame has none of `backPressed`, `escape`, `toggleBestScore`, the panel stays open and the world is unchanged.

**Validates: Requirements 18.5, 18.6, 18.11**

### Property 42: Opening then closing the panel is a round trip

*For any* `Main_Menu` world W with the panel closed, an open input (`highScoresPressed` or `toggleBestScore`) yields W with `menu.bestScoreOpen = true` and nothing else changed; following it with any close input (`backPressed`, `escape`, or `toggleBestScore`) yields a world equal to W.

**Validates: Requirements 18.2, 18.4**

### Property 43: Entering Main_Menu closes the panel

*For any* `Game_Over` world with any `menu` value and any restart input, the resulting `Main_Menu` world has `menu.bestScoreOpen = false`; and *for any* config, play area, high score, and RNG, `createInitialWorld` returns `menu.bestScoreOpen = false`.

**Validates: Requirements 18.9**

## Error Handling

The design favors graceful degradation: no failure in a peripheral subsystem (storage, audio, asset loading) is allowed to interrupt gameplay or rendering.

- **High score load failure or invalid data (R1.7, R1.8).** `HighScoreStore.load()` wraps the `localStorage` read and parse in a try/catch and validates the parsed value. Missing, unreadable, non-numeric, negative, fractional, or out-of-range values all resolve to `0`. Initialization continues into `Main_Menu` regardless. This is guaranteed by Property 17.
- **High score write failure (R9.4).** `HighScoreStore.apply()` wraps `localStorage.setItem` in a try/catch. On failure the in-memory `highScore` in the `World` is retained for the session and the game continues; the error is logged to the console at most, never surfaced as a blocking UI error.
- **Audio asset load/playback failure (R13.4).** `AudioManager` preloads audio elements and attaches error handlers. `play()` returns a promise that is caught and ignored (browsers may reject due to autoplay policy or missing asset). A failed or missing sound simply produces no sound; the simulation is unaffected because audio is a fire-and-forget `Effect` the shell may drop.
- **Sprite load failure or timeout (R12.1, R19.9).** The shell starts a `SPRITE_LOAD_TIMEOUT_MS` (5 s) timer when it begins loading `ghosty.png`. On the image `error` event, or if the image has not loaded when the timer fires, it calls `prepareGhostSprite(null)`, which returns a 32×32 canvas with a filled white ghost-like shape entirely inside the cell. The game continues into `Main_Menu` with no blocking error. A late `load` after the timeout is ignored so the sprite does not swap mid-session. The Hitbox centre and radius are unchanged in either case (R19.4).
- **Invalid Hitbox radius (R19.8, R19.10).** `resolveConfig` replaces a missing, non-numeric, out-of-range (below 8 or above 16), or larger-than-half-sprite `ghostHitboxRadius` with the default 12 and returns a warning, which the shell logs with `console.warn`. Other config values are left as they are. Loading is never blocked.
- **Delta-time spikes (R12.5, R8).** The loop clamps `Delta_Time` to `MAX_DT` (e.g. 1/30 s). A stalled or backgrounded tab therefore cannot produce a huge `dt` that tunnels the Ghost through a pipe or past the ground, keeping collision detection fair.
- **Input outside its valid state.** All input is routed through `stepWorld`, which ignores inputs that do not apply to the current `Game_State` (e.g. flap while `Paused`), so stray events are harmless (Properties 4, 7).
- **Invalid config at load (R16.2–16.5).** The shell calls `resolveConfig(DEFAULT_CONFIG, CONFIG_SCHEMA)` and logs each returned warning with `console.warn`, including key, current value, and allowed range or violated relation. Loading continues into `Main_Menu` with the config as-is (R16.3), apart from the Hitbox radius substitution above. `validateConfig` and `resolveConfig` never throw (Properties 27, 32), so a malformed config cannot abort startup.
- **Reduced-motion query unavailable.** If `window.matchMedia` is missing, the shell treats `reducedMotion` as `false`. It also listens for `change` on the media query so toggling the OS setting takes effect on the next frame.
- **Key auto-repeat and stray panel input (R18.5, R18.10).** `keydown` events with `event.repeat` are dropped in the InputController. While the Best_Score_Panel is open, `stepWorld` ignores every input except Back, Esc, and H, so a stray click or Space cannot start a game.
- **Clipboard failure (R17.7).** If `navigator.clipboard` is unavailable (e.g. non-secure context) or `writeText` rejects, the TuningPanel catches the error and shows a `<textarea>` containing the serialized config, pre-selected for manual copy. No exception escapes and the game loop is unaffected.
- **Panel absent without the debug flag (R17.1, R17.2).** Without `debug=1`, `createTuningPanel` returns `null`: no DOM is created, no `D` handler is registered, and `currentConfig` stays `DEFAULT_CONFIG` for the session. InputController treats a `null` panel as "no panel" and skips the target check.
- **Out-of-range panel input (R17.6).** Typed values outside the schema range, or non-numeric input, are clamped with `clampToSchema` (non-numeric falls back to the current value) before `currentConfig` is replaced, so the core never sees a panel value outside its range.
- **Canvas context unavailable.** If `getContext("2d")` returns null (extremely unusual), the game logs a single console error and aborts initialization gracefully rather than throwing repeatedly in the loop.

## Testing Strategy

The pure/impure split makes the core directly unit- and property-testable with no DOM. Tests run in a browser-agnostic JS test runner.

- **Tooling.** [Vitest](https://vitest.dev/) as the test runner (fast, zero-config, runs plain ES modules) with [fast-check](https://fast-check.dev/) for property-based testing. The property library is used as-is; no PBT harness is written from scratch. Tests are executed once (e.g. `vitest --run`), not in watch mode.
- **Dual approach.** Property tests verify the universal rules of the pure core (Properties 1–43). Unit and integration tests cover concrete examples, rendering content, and browser-side behavior that is not a universal property.
- **Difficulty progression** is fully covered by property tests, since `targetPipeSpeed`/`applyDifficulty` are pure deterministic functions of the score and config (Properties 23–25) — no example-based tests are needed for the speed formula itself.

### Property-based tests

- One property-based test implements each of Properties 1–43 above (43 property tests).
- Each property test runs a **minimum of 100 iterations**.
- Generators produce arbitrary Ghost states, velocities, delta-times (bounded to realistic ≥ 0 ranges, including 0 and the clamp), pipe sets, cloud configs, scores, and seeded RNG values. The RNG is seeded per run so spawning/cloud tests are reproducible.
- For difficulty progression (Properties 23–25), generate arbitrary non-negative integer scores (including 0, values around and far beyond the `maxPipeSpeed` cap, and exact `speedUpInterval` boundaries) and assert the `targetPipeSpeed` formula, monotonicity, per-interval step increments, and the cap. Generate current `pipeSpeed` values across `[basePipeSpeed, maxPipeSpeed]` and layer ratios in (0, 1) to confirm every derived cloud layer speed stays strictly below the pipe speed.
- Because tuning constants are now injected through `GameConfig` rather than hardcoded, property tests may construct alternate `GameConfig` values — including deliberately extreme or very small ones (e.g. tiny `spawnDistance`, minimal `gapHeight`, single-pixel Ghost, near-zero cloud speeds) — to exercise edge cases and confirm the core's invariants hold across the whole configured input space, not just the shipped defaults.
- **Config generators (Properties 26–30).** A `validConfigArb` builds a config from `CONFIG_SCHEMA` by drawing each value from `fc.double({ min, max, noNaN: true })` (or integers where `step` is integral), then enforces `maxPipeSpeed ≥ basePipeSpeed` and draws at least two distinct ratios from `fc.double({ min: Number.EPSILON, max: 1 - Number.EPSILON })`. An `invalidConfigArb` starts from a valid config and applies one mutation: a schema value just outside or far outside its range, `NaN`/`Infinity`, `maxPipeSpeed < basePipeSpeed`, or a cloud ratio from {0, 1, negative, > 1}. The test records which key was mutated and asserts a matching warning. Property 30 uses `validConfigArb` twice with shared non-physics fields.
- **Hitbox radius in config generators.** `validConfigArb` draws `ghostHitboxRadius` as an integer in `[8, min(16, floor(min(ghostWidth, ghostHeight) / 2))]`. `invalidConfigArb` adds mutations for the radius: `undefined`, a string, `NaN`, 7, 17, and a value above half the sprite size (e.g. 14 with a 24×24 sprite). Property 32 checks the corrected config with a deep-equality comparison on every field except the radius.
- **Collision generators (Properties 13, 31).** Rects with integer or dyadic coordinates, circles with centres inside, outside, on corners, and on edges. The boundary case places the centre at `rect.x − r` (or the matching offset beside any edge) with integers, so `distance == r` is exact in floating point. The brute-force reference computes `Math.hypot` of the clamped offset and compares with `<`. Property 13 also generates worlds whose ghost satisfies `y + r == groundY` exactly and asserts no `Game_Over`.
- **Animation generators (Properties 34–40).** Arbitrary `AnimState` values (every kind, valid frame indices, `elapsedMs` within the frame's duration, rotation in [−20, 45]), event lists drawn from `FlapApplied` and `StateEntered`, and `dtMs` sequences in `[0, MAX_DT · 1000]` including 0 and exact frame boundaries (60, 120, 150, 200, 320). Property 34 runs a random `(InputFrame, dt)` script through `stepWorld` twice, once with animation interleaved, and compares the worlds with deep equality.
- **Menu generators (Properties 41–43).** `InputFrame`s with arbitrary combinations of all flags (including simultaneous start and panel flags), over `Main_Menu` worlds with both panel states.
- Each property test is tagged with a comment in the format:
  `// Feature: flappy-kiro, Property {number}: {property_text}`
- Numerical properties (Properties 2, 3) assert equality within a small floating-point tolerance; Property 3 additionally restricts generated ranges to avoid mixing capped and uncapped regimes so the metamorphic comparison is meaningful.

### Unit tests (examples, edge cases, error conditions)

- **Initialization:** game initializes to `Main_Menu` (R1.1); Ghost starts at (30% w, 50% h) for a given play area (R1.3); `load()` returns 0 when storage is empty (R1.7).
- **Input mapping:** `mousedown`/`touchstart` that hit no button and Spacebar set `InputFrame.flap`; `P` sets `togglePause` (R3.1–3.3, R5.1). Enter sets `startKey` but never `flap`, and a `Playing` step with only Enter leaves `vy` unchanged apart from gravity (R3, R2.1, R10.2). H sets `toggleBestScore`, Escape sets `escape`.
- **Key repeat (R18.10):** dispatching `keydown` H with `repeat: false` then several with `repeat: true` in later frames produces `toggleBestScore` exactly once; the same for Escape.
- **Button hit areas (R18.1, R18.8):** every `UI_BUTTONS` rect is ≥ 44×44 logical px; `displayRect(button, s)` is ≥ 44 CSS px per side for scales 0.5, 0.75, 1, and 2; PLAY and HIGH_SCORES (and their grown rects at the smallest supported scale) do not overlap; `hitTest` at a point inside HIGH_SCORES returns `HIGH_SCORES`, never `PLAY`, and only returns buttons visible in the current state.
- **Hitbox defaults (R12.1, R19.1, R19.4):** `DEFAULT_CONFIG` has `ghostWidth = ghostHeight = 32` and `ghostHitboxRadius = 12`; `ghostHitbox` is centred on `(ghost.x, ghost.y)`.
- **Ghost draw origin (R19.1):** for sample positions with fractional coordinates (e.g. `(144.4, 320.6)`), the Renderer calls `drawImage` with `(Math.round(x − 16), Math.round(y − 16), 32, 32)` and `imageSmoothingEnabled === false`.
- **`prepareGhostSprite` with a mock canvas (R19.2, R19.3, R19.9):** with a stub 1290×1567 image and a mock 2D context, it sets `imageSmoothingEnabled = true`, calls `drawImage` once with the `fitRect(1290, 1567, 32)` destination, and returns a 32×32 canvas. Rendering 100 frames afterwards calls `drawImage` only with the cached canvas, never the source image. With `null` it draws a white fill whose bounds lie inside the 32×32 cell.
- **Sprite timeout (R19.9):** with fake timers and an image that never loads, after 5000 ms the Renderer uses the fallback canvas and the game reaches `Main_Menu`; a later `load` event does not replace it.
- **Reduced motion (R20.10):** with `matchMedia` stubbed to match `(prefers-reduced-motion: reduce)`, the loop passes `reducedMotion = true`; with `matchMedia` absent it passes `false`.
- **Effects:** a start from `Main_Menu` and each in-`Playing` Flap emit both `FlapApplied` and `PlaySound "jump"`; each transition emits the matching `StateEntered`.
- **Storage error handling:** mock `localStorage.setItem` to throw and assert no exception escapes and the in-memory high score is retained (R9.4).
- **Audio behavior:** with a mocked audio element, a second flap while the jump sound is playing resets `currentTime` to 0 (R13.3); a rejected `play()` promise does not break the frame (R13.4).
- **Config/appearance bounds:** Ghost dimensions within [24, 48] (R12.1); pipe width within [40, 80] (R12.2); cloud count within [1, 10] (R12.3); Score_Display font size within [16, 48] (R12.4).
- **Config defaults and load warnings:** `DEFAULT_CONFIG` has gravity 1600, flapVelocity −450, terminalVelocity 700, speedUpInterval 5 (R16.7); every key listed in R17.4 has a schema entry with `panel: true`; with a `console.warn` spy, booting with an invalid config logs one warning per problem and still reaches `Main_Menu` (R16.2, R16.3), and booting with `DEFAULT_CONFIG` logs none (R16.6).

### TuningPanel tests (Vitest + jsdom)

Run in Vitest's `jsdom` environment (`// @vitest-environment jsdom`), with a stub `getConfig`/`setConfig` pair.

- **Enablement:** `createTuningPanel({ search: "?debug=1", ... })` returns a panel and appends its root; with `""` or `"?debug=0"` it returns `null`, adds no DOM, and a dispatched `D` keydown changes nothing (R17.1, R17.2).
- **Toggle:** with the panel enabled, dispatching `D` keydown toggles the root's hidden state on and off (R17.3).
- **Controls and edits:** one row per `panel: true` schema entry (R17.4); setting a number input above `max` calls `setConfig` with the clamped value and a new config object, leaving the old one unmutated (R17.5, R17.6).
- **No flap from panel clicks:** dispatching `mousedown`/`touchstart`/Space `keydown` on a panel input, then calling `drainInputBuffer()`, yields `flap: false` (R17.9).
- **Copy:** with a mocked `navigator.clipboard.writeText`, clicking Copy calls it with `serializeConfig(currentConfig)`; with `writeText` rejecting or `navigator.clipboard` undefined, a selected `<textarea>` containing the same text appears and no error escapes (R17.7).
- **No persistence:** after edits, `localStorage` is untouched, and a freshly created panel/loop starts from `DEFAULT_CONFIG` (R17.8).

### Rendering / integration tests

- Render each `Game_State` to an offscreen canvas and assert the Score_Display is drawn within the play area in every state (R11.1) and that state overlays contain the expected content: title + high score + start prompt on `Main_Menu` (R1.2, R1.4), a paused indicator on `Paused` (R5.3), and final score + high score + restart prompt on `Game_Over` (R10.1, R9.5, R7.3). The `Main_Menu` render shows the PLAY and HIGH SCORES buttons (R18.1); with `menu.bestScoreOpen` it shows the Best_Score_Panel with a BACK button and the same `highScore` as the Score_Display (R18.3); `Playing` and `Paused` show the pause button (R5.1, R18.8). These use snapshot/inspection assertions rather than property tests, since rendered appearance does not vary meaningfully across generated inputs.

### Manual / smoke checks

- Frame rate ≥ 30 FPS during play (R12.5) and input-to-response latency ≤ 50 ms (R3.1–3.3, R13.1, R13.2) are verified by manual play-testing and lightweight in-browser performance measurement, as they depend on the real browser and hardware rather than on pure logic.

