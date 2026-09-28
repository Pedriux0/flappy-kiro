// Pure scoring: pass detection for Pipe_Pairs (Requirements 7.1, 7.2).

/**
 * Compute the score after a frame.
 *
 * `prev` is the world before this frame's scoring (its `score` is the base),
 * `next` is the world after the Ghost and pipes have moved. A pair is counted
 * when the Ghost's x is strictly past the pair's trailing edge (`x + width`)
 * in `next` and the pair has not already been counted.
 *
 * A pair counts as "already counted" if it has `scored = true` in `prev` or
 * `next`, or its id is in an optional `passed` Set on either world.
 *
 * Does not mutate its inputs.
 *
 * @param {{ score: number, pipes: Array<{id: number, x: number, width: number, scored: boolean}>, passed?: Set<number> }} prev
 * @param {{ ghost: { x: number }, pipes: Array<{id: number, x: number, width: number, scored: boolean}>, passed?: Set<number> }} next
 * @returns {{ score: number, passed: Set<number> }}
 */
export function updateScore(prev, next) {
  const passed = new Set();
  const addExisting = (world) => {
    if (!world) return;
    if (world.passed instanceof Set) for (const id of world.passed) passed.add(id);
    for (const p of world.pipes ?? []) if (p.scored) passed.add(p.id);
  };
  addExisting(prev);
  addExisting(next);

  const ghostX = next.ghost.x;
  let gained = 0;
  for (const p of next.pipes ?? []) {
    if (passed.has(p.id)) continue;
    if (ghostX > p.x + p.width) {
      passed.add(p.id);
      gained += 1;
    }
  }

  const base = Number.isFinite(prev?.score) ? prev.score : 0;
  return { score: base + gained, passed };
}
