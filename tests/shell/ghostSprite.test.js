import { describe, it, expect, vi } from 'vitest';
import { prepareGhostSprite, loadGhostSprite } from '../../src/shell/ghostSprite.js';
import { fitRect } from '../../src/core/sprite.js';

/** Mock canvas whose 2D context records every call. */
function mockCanvasFactory() {
  const canvases = [];
  const createCanvas = (w, h) => {
    const calls = [];
    const ctx = new Proxy(
      { calls },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          return (...args) => calls.push([prop, ...args]);
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      },
    );
    const canvas = { width: w, height: h, ctx, getContext: () => ctx };
    canvases.push(canvas);
    return canvas;
  };
  return { createCanvas, canvases };
}

/** Mock image that exposes onload/onerror and records its src. */
function mockImageFactory(dims = { width: 1290, height: 1567 }) {
  const images = [];
  const createImage = () => {
    const img = { ...dims, onload: null, onerror: null, src: '' };
    images.push(img);
    return img;
  };
  return { createImage, images };
}

describe('prepareGhostSprite', () => {
  it('draws the image once at fitRect with high-quality smoothing', () => {
    const { createCanvas } = mockCanvasFactory();
    const image = { width: 1290, height: 1567 };
    const canvas = prepareGhostSprite(image, { createCanvas });
    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(32);
    expect(canvas.ctx.imageSmoothingEnabled).toBe(true);
    expect(canvas.ctx.imageSmoothingQuality).toBe('high');
    const draws = canvas.ctx.calls.filter((c) => c[0] === 'drawImage');
    const r = fitRect(1290, 1567, 32);
    expect(draws).toEqual([['drawImage', image, r.x, r.y, r.width, r.height]]);
  });

  it('prefers naturalWidth/naturalHeight', () => {
    const { createCanvas } = mockCanvasFactory();
    const image = { width: 10, height: 10, naturalWidth: 64, naturalHeight: 32 };
    const canvas = prepareGhostSprite(image, { createCanvas });
    const [, , x, y, w, h] = canvas.ctx.calls.find((c) => c[0] === 'drawImage');
    expect([x, y, w, h]).toEqual([0, 8, 32, 16]);
  });

  it('throws on a zero-size image', () => {
    const { createCanvas } = mockCanvasFactory();
    expect(() => prepareGhostSprite({ width: 0, height: 0 }, { createCanvas })).toThrow();
  });

  it('draws a filled white fallback entirely inside the cell when image is null', () => {
    const { createCanvas } = mockCanvasFactory();
    const canvas = prepareGhostSprite(null, { createCanvas });
    const { calls } = canvas.ctx;
    expect(canvas.ctx.fillStyle).toBe('#ffffff');
    expect(calls.some((c) => c[0] === 'fill')).toBe(true);
    expect(calls.some((c) => c[0] === 'drawImage')).toBe(false);

    // Collect every point the path touches (arc contributes its bounding extent).
    const pts = [];
    for (const [op, ...a] of calls) {
      if (op === 'moveTo' || op === 'lineTo') pts.push([a[0], a[1]]);
      if (op === 'quadraticCurveTo') pts.push([a[0], a[1]], [a[2], a[3]]);
      if (op === 'arc') {
        const [cx, cy, r] = a;
        pts.push([cx - r, cy], [cx + r, cy], [cx, cy - r]);
      }
    }
    expect(pts.length).toBeGreaterThan(0);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(32);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(32);
    }
  });
});

describe('loadGhostSprite', () => {
  function setup(dims) {
    const { createCanvas, canvases } = mockCanvasFactory();
    const { createImage, images } = mockImageFactory(dims);
    let timerFn = null;
    const setTimer = vi.fn((fn) => {
      timerFn = fn;
      return 1;
    });
    const promise = loadGhostSprite({ src: 'assets/ghosty.png', createImage, createCanvas, setTimer });
    return { promise, images, canvases, setTimer, fireTimer: () => timerFn() };
  }
  const isFallback = (canvas) => !canvas.ctx.calls.some((c) => c[0] === 'drawImage');

  it('sets src, arms a 5 s timer, and resolves to the prepared sprite on load', async () => {
    const { promise, images, setTimer } = setup();
    expect(images[0].src).toBe('assets/ghosty.png');
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 5000);
    images[0].onload();
    const sprite = await promise;
    expect(isFallback(sprite)).toBe(false);
  });

  it('resolves to the fallback on error', async () => {
    const { promise, images } = setup();
    images[0].onerror();
    expect(isFallback(await promise)).toBe(true);
  });

  it('resolves to the fallback on timeout and ignores a late load', async () => {
    const { promise, images, canvases, fireTimer } = setup();
    fireTimer();
    images[0].onload();
    const sprite = await promise;
    expect(isFallback(sprite)).toBe(true);
    expect(canvases).toHaveLength(1); // late load did not prepare another sprite
  });

  it('with fake timers and the default setTimer, resolves to the fallback at 5000 ms and keeps it after a later load', async () => {
    vi.useFakeTimers();
    try {
      const { createCanvas, canvases } = mockCanvasFactory();
      const { createImage, images } = mockImageFactory();
      let result;
      loadGhostSprite({ src: 'assets/ghosty.png', createImage, createCanvas }).then((s) => {
        result = s;
      });

      await vi.advanceTimersByTimeAsync(4999);
      expect(result).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      expect(result).toBeDefined();
      expect(isFallback(result)).toBe(true);
      const fallback = result;

      images[0].onload(); // image finally arrives, too late
      await vi.runAllTimersAsync();
      expect(result).toBe(fallback);
      expect(canvases).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back when the loaded image has zero size', async () => {
    const { promise, images } = setup({ width: 0, height: 0 });
    images[0].onload();
    expect(isFallback(await promise)).toBe(true);
  });
});
