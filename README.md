# Flappy Kiro 👻

A Flappy Bird–style browser game starring Kiro's ghost, built with vanilla JavaScript and Canvas 2D (no build step).

## About this project

I built this project with [Kiro](https://kiro.dev) and playabe in (https://pedriux0.github.io/flappy-kiro/) during the **AWS Student Community Day**. I started from the base game and then used Kiro's spec-driven workflow (requirements → design → tasks) to add upgrades — some that I found in the community and some of my own ideas.

The full specs live in [`.kiro/specs/flappy-kiro/`](.kiro/specs/flappy-kiro/):
- `requirements.md` — what the game must do
- `design.md` — architecture and correctness properties
- `tasks.md` — the implementation plan Kiro executed
- `ui-mockups.md`, `ghosty-sprites.md` — visual references

## Upgrades

Beyond the basic flap-and-dodge game, this version adds:

- **Best Score panel** — view your high score from the main menu (High Scores button or `H`)
- **Circular hitbox** — fairer collisions that match the ghost's shape
- **Ghost animations** — flap squash & stretch, velocity tilt, and a death animation
- **Difficulty ramp-up** — pipes speed up as your score grows
- **Parallax clouds** — layered background scrolling
- **Pause and mute** — `P` to pause, `M` to mute
- **Reduced-motion support** — respects your OS `prefers-reduced-motion` setting
- **Persistent high score** — saved in `localStorage`
- **Debug tuning panel** — open the game with `?debug=1` and press `D` to tweak physics and difficulty live

## Controls

| Action | Input |
| --- | --- |
| Start / flap | Click, tap, or `Space` |
| Start (no flap) | `Enter` |
| Pause / resume | `P` or the on-screen button |
| Best Score panel | `H` or High Scores button; `Esc` / Back to close |
| Mute | `M` |
| Tuning panel (debug) | `D` with `?debug=1` in the URL |

## Run it locally

The game uses ES modules, so it must be served over HTTP (opening `index.html` via `file://` won't work):

```bash
python3 -m http.server
# then open http://localhost:8000
```

## Tests

```bash
npm install
npm test
```

The suite uses [Vitest](https://vitest.dev) and [fast-check](https://fast-check.dev): property-based tests for each of the design's 43 correctness properties, plus unit and integration tests.

## Project structure

```
index.html, styles.css   Page and styles
src/core/                Pure game logic (no DOM)
src/shell/               Browser code: rendering, input, audio, storage, game loop
src/main.js              Bootstrap
tests/                   Unit, property, and integration tests
assets/                  Sprite and sounds
```
