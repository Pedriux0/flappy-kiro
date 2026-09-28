// Pipe scrolling, spawning, and culling (pure core, no mutation).
//
// Every PipePair stores its own `gapHeight`, captured from `config.gapHeight`
// at spawn, so live edits to `gapHeight` / `spawnDistance` only affect pairs
// spawned afterwards (R6.4, R15.7).

/**
 * @typedef {{ id: number, x: number, width: number, gapY: number, gapHeight: number, scored: boolean }} PipePair
 * @typedef {{ width: number, height: number, groundY: number, ceilingY: number }} PlayArea
 */

/**
 * Move every pair left by `speed · dt` at one shared speed (R6.1, R15.5).
 * @param {PipePair[]} pipes
 * @param {number} dt seconds
 * @param {number} speed current shared world.pipeSpeed, px/s
 * @returns {PipePair[]}
 */
export function scrollPipes(pipes, dt, speed) {
  const dx = speed * dt;
  return pipes.map((pipe) => ({ ...pipe, x: pipe.x - dx }));
}

/**
 * Drop pairs fully past the left edge (`x + width < 0`); keep all others as-is (R6.5).
 * @param {PipePair[]} pipes
 * @returns {PipePair[]}
 */
export function cullPipes(pipes) {
  return pipes.filter((pipe) => !(pipe.x + pipe.width < 0));
}

/**
 * Next unique pipe id: greater than every id currently in `pipes`, and at
 * least `world.nextPipeId` when the world tracks one. Tracking `nextPipeId`
 * in World keeps ids unique even after every pair has been culled.
 * @param {PipePair[]} pipes
 * @param {{ nextPipeId?: number }} world
 * @returns {number}
 */
function nextId(pipes, world) {
  let id = world && Number.isInteger(world.nextPipeId) ? world.nextPipeId : 0;
  for (const pipe of pipes) {
    if (pipe.id >= id) id = pipe.id + 1;
  }
  return id;
}

/**
 * Spawn at most one new pair when no pipes exist or when the rightmost pair's
 * distance from the spawn edge (`playArea.width`) has reached
 * `config.spawnDistance` (R6.2). The new pair sits exactly `spawnDistance`
 * right of the previous rightmost pair (or at the spawn edge when there are
 * none), and its Gap is placed by `rng` so that
 * `ceilingY <= gapY` and `gapY + gapHeight <= groundY` (R6.4).
 *
 * @param {PipePair[]} pipes
 * @param {{ playArea: PlayArea, nextPipeId?: number }} world
 * @param {{ spawnDistance: number, pipeWidth: number, gapHeight: number }} config
 * @param {{ next(): { value: number, rng: any } }} rng
 * @returns {{ pipes: PipePair[], rng: any }}
 */
export function maybeSpawnPipe(pipes, world, config, rng) {
  const { width: spawnEdge, ceilingY, groundY } = world.playArea;

  let x;
  if (pipes.length === 0) {
    x = spawnEdge;
  } else {
    const rightmostX = Math.max(...pipes.map((pipe) => pipe.x));
    if (spawnEdge - rightmostX < config.spawnDistance) {
      return { pipes, rng };
    }
    x = rightmostX + config.spawnDistance;
  }

  const gapHeight = config.gapHeight;
  const span = Math.max(0, groundY - gapHeight - ceilingY);
  const { value, rng: nextRng } = rng.next();
  // Clamp guards against floating-point rounding pushing the Gap out of bounds.
  const gapY = Math.max(ceilingY, Math.min(ceilingY + value * span, groundY - gapHeight));

  const pipe = {
    id: nextId(pipes, world),
    x,
    width: config.pipeWidth,
    gapY,
    gapHeight,
    scored: false,
  };
  return { pipes: [...pipes, pipe], rng: nextRng };
}
