// World construction and reset (pure core).
// Requirements: 1.1, 1.3, 1.4, 1.5, 10.3, 10.4, 10.5, 15.1, 18.9.
//
// The World holds simulation state only. Tuning values are never copied into
// it: stepWorld reads them from the `config` argument every frame (R17).
// Both functions are pure and return new objects; inputs are never mutated.

import { createClouds } from "./clouds.js";

/**
 * @typedef {{ width: number, height: number, groundY: number, ceilingY: number }} PlayArea
 * @typedef {{ x: number, y: number, vy: number, width: number, height: number }} Ghost
 * @typedef {{
 *   state: "Main_Menu" | "Playing" | "Paused" | "Game_Over",
 *   ghost: Ghost,
 *   pipes: Array<object>,
 *   clouds: Array<object>,
 *   score: number,
 *   highScore: number,
 *   playArea: PlayArea,
 *   pipeSpeed: number,
 *   speedTier: number,
 *   rng: { next(): { value: number, rng: any } },
 *   muted: boolean,
 *   menu: { bestScoreOpen: boolean },
 *   passed: Set<number>,
 *   nextPipeId: number,
 * }} World
 */

/**
 * Ghost at its start position: (ghostStartXRatio * width, ghostStartYRatio * height),
 * at rest, sized from config (R1.3).
 * @param {object} config GameConfig
 * @param {PlayArea} playArea
 * @returns {Ghost}
 */
function startGhost(config, playArea) {
  return {
    x: config.ghostStartXRatio * playArea.width,
    y: config.ghostStartYRatio * playArea.height,
    vy: 0,
    width: config.ghostWidth,
    height: config.ghostHeight,
  };
}

/**
 * Build the Main_Menu World for a new session (R1.1, R1.3, R1.4, R1.5, R15.1, R18.9).
 * @param {object} config GameConfig
 * @param {PlayArea} playArea
 * @param {number} highScore value loaded from the HighScoreStore
 * @param {{ next(): { value: number, rng: any } }} rng seeded PRNG
 * @returns {World}
 */
export function createInitialWorld(config, playArea, highScore, rng) {
  const { clouds, rng: nextRng } = createClouds(config, playArea, rng);
  return {
    state: "Main_Menu",
    ghost: startGhost(config, playArea),
    pipes: [],
    clouds,
    score: 0,
    highScore,
    playArea: { ...playArea },
    pipeSpeed: config.basePipeSpeed,
    speedTier: 0,
    rng: nextRng,
    muted: false,
    menu: { bestScoreOpen: false },
    passed: new Set(),
    nextPipeId: 0,
  };
}

/**
 * Return to Main_Menu from Game_Over (R10.3, R10.4, R10.5, R18.9).
 * Restores the Ghost start position with vy = 0, clears pipes, score and the
 * scored-pair set, resets pipeSpeed/speedTier, and closes the Best_Score_Panel.
 * Keeps highScore, rng, clouds, muted, and playArea.
 *
 * `nextPipeId` is kept (monotonic across rounds) rather than reset, so pipe ids
 * stay unique for the whole session and can never collide with a stale id.
 *
 * @param {World} world
 * @param {object} config GameConfig
 * @returns {World}
 */
export function resetToMenu(world, config) {
  return {
    ...world,
    state: "Main_Menu",
    ghost: startGhost(config, world.playArea),
    pipes: [],
    score: 0,
    pipeSpeed: config.basePipeSpeed,
    speedTier: 0,
    menu: { ...world.menu, bestScoreOpen: false },
    passed: new Set(),
  };
}
