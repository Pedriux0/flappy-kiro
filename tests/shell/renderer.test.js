// Rendering tests for src/shell/renderer.js (task 9.14).
// jsdom has no canvas implementation, so a recording Proxy stands in for the 2D context.
// Requirements: 1.2, 5.1, 5.3, 7.3, 9.5, 10.1, 11.1, 12.1, 18.1, 18.3, 19.1, 19.3
import { describe, it, expect } from 'vitest';
import { createRenderer } from '../../src/shell/renderer.js';
import { createPlayArea, UI_BUTTONS, LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../src/shell/constants.js';
import { prepareGhostSprite } from '../../src/shell/ghostSprite.js';

/** Recording 2D context: every method call and property set is logged in order. */
function mockCtx(width = LOGICAL_WIDTH, height = LOGICAL_HEIGHT) {
  const calls = [];
  const target = { calls, canvas: { width, height } };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => calls.push([prop, ...args]);
    },
    set(t, prop, value) {
      calls.push(['set:' + String(prop), value]);
      t[prop] = value;
      return true;
    },
  });
}

/** Mock canvas factory; each canvas owns a recording context. */
function mockCanvasFactory() {
  const created = [];
  const factory = (w, h) => {
    const ctx = mockCtx(w, h);
    const canvas = { width: w, height: h, ctx, getContext: () => ctx };
    created.push(canvas);
    return canvas;
  };
  return { factory, created };
}

function world(overrides = {}) {
  return {
    state: 'Playing',
    ghost: { x: 144.4, y: 320.6, vy: 0, width: 32, height: 32 },
    pipes: [{ id: 1, x: 300, width: 60, gapY: 200, gapHeight: 160, scored: false }],
    clouds: [{ x: 50, y: 60, scale: 1, layer: 0, opacity: 0.5, width: 64, wrapWidth: 544 }],
    score: 3,
    highScore: 7,
    playArea: createPlayArea(),
    menu: { bestScoreOpen: false },
    muted: false,
    ...overrides,
  };
}

const fillTexts = (ctx) => ctx.calls.filter((c) => c[0] === 'fillText');
const texts = (ctx) => fillTexts(ctx).map((c) => c[1]);
const drawImages = (ctx) => ctx.calls.filter((c) => c[0] === 'drawImage');

/** Value of imageSmoothingEnabled in effect at call index i (last set before it). */
function smoothingAt(ctx, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (ctx.calls[j][0] === 'set:imageSmoothingEnabled') return ctx.calls[j][1];
  }
  return undefined;
}

const SCORE_TEXT = 'Score: 3 | High: 7';

describe('renderer: score display and overlays per Game_State', () => {
  const sprite = { tag: 'sprite' };
  const cases = [
    { name: 'Main_Menu', w: world({ state: 'Main_Menu' }), strings: ['FLAPPY KIRO', 'High Score: 7', 'Click, tap or press Space'], buttons: ['PLAY', 'HIGH_SCORES'] },
    { name: 'Main_Menu + Best_Score_Panel', w: world({ state: 'Main_Menu', menu: { bestScoreOpen: true } }), strings: ['BEST SCORE', '7'], buttons: ['BACK'] },
    { name: 'Playing', w: world({ state: 'Playing' }), strings: [], buttons: ['PAUSE'] },
    { name: 'Paused', w: world({ state: 'Paused' }), strings: ['PAUSED', 'Press P to resume'], buttons: ['RESUME'] },
    { name: 'Death', w: world({ state: 'Death' }), strings: [], buttons: [] },
    { name: 'Game_Over', w: world({ state: 'Game_Over' }), strings: ['GAME OVER', 'Score: 3', 'Best: 7', 'Click, tap or press Space'], buttons: ['RESTART'] },
  ];

  for (const { name, w, strings, buttons } of cases) {
    it(`${name}: score text inside play area, expected strings and buttons`, () => {
      const ctx = mockCtx();
      createRenderer(ctx, { ghostSprite: sprite }).draw(w);

      // Score_Display drawn exactly once, within the logical 480×640 area.
      const score = fillTexts(ctx).filter((c) => c[1] === SCORE_TEXT);
      expect(score).toHaveLength(1);
      const [, , x, y] = score[0];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(LOGICAL_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(LOGICAL_HEIGHT);

      for (const s of strings) expect(texts(ctx)).toContain(s);

      // Exactly the buttons visible in this state are drawn (rect + label).
      for (const b of Object.values(UI_BUTTONS)) {
        const rectDrawn = ctx.calls.some(
          (c) => c[0] === 'strokeRect' && c[1] === b.x && c[2] === b.y && c[3] === b.width && c[4] === b.height,
        );
        const labelDrawn = texts(ctx).includes(b.label);
        if (buttons.includes(b.id)) {
          expect(rectDrawn, `${b.id} rect`).toBe(true);
          expect(labelDrawn, `${b.id} label`).toBe(true);
        } else {
          expect(rectDrawn, `${b.id} rect should not be drawn`).toBe(false);
        }
      }
    });
  }

  it('Best_Score_Panel shows the same highScore as the Score_Display', () => {
    for (const highScore of [0, 7, 42, 999]) {
      const ctx = mockCtx();
      const w = world({ state: 'Main_Menu', menu: { bestScoreOpen: true }, score: 0, highScore });
      createRenderer(ctx, { ghostSprite: sprite }).draw(w);
      const all = texts(ctx);
      const scoreLine = all.find((s) => s.startsWith('Score: '));
      const shownHigh = Number(scoreLine.match(/High: (\d+)/)[1]);
      const i = all.indexOf('BEST SCORE');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(all[i + 1]).toBe(String(shownHigh));
      expect(shownHigh).toBe(highScore);
    }
  });

  it('applies the device scale transform and does not mutate world', () => {
    const ctx = mockCtx(960, 1280);
    const w = world();
    const snapshot = JSON.stringify(w);
    createRenderer(ctx, { ghostSprite: sprite }).draw(w);
    expect(JSON.stringify(w)).toBe(snapshot);
    expect(ctx.calls).toContainEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
    // Score coordinates stay logical (pre-transform).
    const [, , x, y] = fillTexts(ctx).find((c) => c[1] === SCORE_TEXT);
    expect(x).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(y).toBeLessThanOrEqual(LOGICAL_HEIGHT);
  });
});

describe('renderer: ghost sprite blit', () => {
  function preparedSprite() {
    const source = { tag: 'source-image', width: 64, height: 64, naturalWidth: 64, naturalHeight: 64 };
    const { factory, created } = mockCanvasFactory();
    const cached = prepareGhostSprite(source, { size: 32, createCanvas: factory });
    // Sanity: the source is drawn exactly once, into the cache canvas.
    expect(created).toHaveLength(1);
    expect(drawImages(created[0].ctx).filter((c) => c[1] === source)).toHaveLength(1);
    return { source, cached };
  }

  it('draws the cached sprite at the rounded cell origin for a fractional position with smoothing off', () => {
    const { cached } = preparedSprite();
    const ctx = mockCtx();
    const x = 144.4;
    const y = 320.6;
    createRenderer(ctx, { ghostSprite: cached }).draw(world({ ghost: { x, y, vy: 0, width: 32, height: 32 } }));
    const i = ctx.calls.findIndex((c) => c[0] === 'drawImage');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ctx.calls[i]).toEqual(['drawImage', cached, Math.round(x - 16), Math.round(y - 16), 32, 32]);
    expect(smoothingAt(ctx, i)).toBe(false);
  });

  it('never passes the source image to drawImage across 100 frames', () => {
    const { source, cached } = preparedSprite();
    const ctx = mockCtx();
    const r = createRenderer(ctx, { ghostSprite: cached });
    let y = 300.25;
    for (let f = 0; f < 100; f++) {
      y += 1.37;
      r.draw(world({ ghost: { x: 144.4, y, vy: 0, width: 32, height: 32 } }));
    }
    const imgs = drawImages(ctx);
    expect(imgs).toHaveLength(100);
    for (const c of imgs) {
      expect(c[1]).not.toBe(source);
      expect(c[1]).toBe(cached);
      expect(Number.isInteger(c[2]) && Number.isInteger(c[3])).toBe(true);
      expect([c[4], c[5]]).toEqual([32, 32]);
    }
  });

  it('flash visual uses a tint cache built once, not per frame', () => {
    const { source, cached } = preparedSprite();
    const { factory, created } = mockCanvasFactory();
    const ctx = mockCtx();
    const r = createRenderer(ctx, { ghostSprite: cached, createCanvas: factory });
    const flash = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, eyes: 'normal', flash: true };
    for (let f = 0; f < 100; f++) r.draw(world({ state: 'Death' }), flash);

    expect(created).toHaveLength(1);
    const tint = created[0];
    const tintDraws = drawImages(tint.ctx);
    expect(tintDraws.length).toBeLessThanOrEqual(1);
    expect(tintDraws[0][1]).toBe(cached);

    const imgs = drawImages(ctx);
    expect(imgs).toHaveLength(100);
    for (const c of imgs) {
      expect(c[1]).toBe(tint);
      expect(c[1]).not.toBe(source);
    }
  });

  it('draws a white rect when no sprite is available', () => {
    const ctx = mockCtx();
    createRenderer(ctx, { ghostSprite: null }).draw(world(), {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 10, opacity: 0.7, eyes: 'cross', flash: false,
    });
    expect(ctx.calls).toContainEqual(['fillRect', 128, 305, 32, 32]);
    expect(drawImages(ctx)).toHaveLength(0);
  });
});
