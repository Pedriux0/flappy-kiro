import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createClouds, layerSpeeds, scrollClouds, CLOUD_BASE_WIDTH } from "../../src/core/clouds.js";
import { createRng } from "../../src/core/rng.js";

const config = {
  cloudLayerSpeedRatios: [0.2, 0.4],
  cloudCount: 6,
  cloudOpacityMin: 0.3,
  cloudOpacityMax: 0.8,
};
const playArea = { width: 480, height: 640, groundY: 640, ceilingY: 0 };

describe("createClouds", () => {
  it("creates cloudCount clouds over every layer, within bounds", () => {
    const { clouds, rng } = createClouds(config, playArea, createRng(1));
    expect(clouds).toHaveLength(6);
    expect(new Set(clouds.map((c) => c.layer))).toEqual(new Set([0, 1]));
    expect(rng).toBeDefined();
    for (const c of clouds) {
      expect(c.opacity).toBeGreaterThanOrEqual(0.3);
      expect(c.opacity).toBeLessThanOrEqual(0.8);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(480);
      expect(c.wrapWidth).toBe(480);
      expect(c.width).toBeCloseTo(CLOUD_BASE_WIDTH * c.scale);
    }
  });

  it("is deterministic for a seed and advances the rng", () => {
    const a = createClouds(config, playArea, createRng(9));
    const b = createClouds(config, playArea, createRng(9));
    expect(a.clouds).toEqual(b.clouds);
    expect(a.rng.next().value).not.toBe(createRng(9).next().value);
  });

  it("keeps opacity in the configured range for any seed", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 10 }), (seed, count) => {
        const { clouds } = createClouds({ ...config, cloudCount: count }, playArea, createRng(seed));
        expect(clouds).toHaveLength(count);
        return clouds.every((c) => c.opacity >= 0.3 && c.opacity <= 0.8);
      }),
    );
  });
});

describe("layerSpeeds", () => {
  it("returns ratio * pipeSpeed per layer", () => {
    expect(layerSpeeds(200, [0.2, 0.4])).toEqual([40, 80]);
  });

  it("every layer is strictly slower than a positive pipe speed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.array(fc.double({ min: 0.01, max: 0.99, noNaN: true }), { minLength: 2, maxLength: 5 }),
        (pipeSpeed, ratios) => layerSpeeds(pipeSpeed, ratios).every((s) => s < pipeSpeed),
      ),
    );
  });
});

describe("scrollClouds", () => {
  const cloud = { x: 100, y: 50, scale: 1, layer: 1, opacity: 0.5, width: 64, wrapWidth: 480 };

  it("moves each cloud by its layer speed without mutating input", () => {
    const input = [cloud, { ...cloud, layer: 0 }];
    const out = scrollClouds(input, 0.5, 200, [0.2, 0.4]);
    expect(out[0].x).toBeCloseTo(100 - 80 * 0.5);
    expect(out[1].x).toBeCloseTo(100 - 40 * 0.5);
    expect(input[0].x).toBe(100);
    expect(out[0]).not.toBe(input[0]);
  });

  it("does not move clouds when dt is 0", () => {
    expect(scrollClouds([cloud], 0, 200, [0.2, 0.4])[0].x).toBe(100);
  });

  it("wraps to the right edge once fully past the left edge", () => {
    const edge = { ...cloud, x: -60 }; // right edge at 4
    const [moved] = scrollClouds([edge], 0.1, 200, [0.2, 0.4]); // moves 8 px -> right edge at -4
    expect(moved.x).toBeCloseTo(480 - 4);
  });

  it("does not wrap while still partly visible", () => {
    const [moved] = scrollClouds([{ ...cloud, x: -10 }], 0.1, 200, [0.2, 0.4]);
    expect(moved.x).toBeCloseTo(-18);
  });

  it("always stays within [-width, wrapWidth) after wrapping for any dt", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (dt) => {
        const [moved] = scrollClouds([cloud], dt, 300, [0.2, 0.4]);
        return moved.x >= -cloud.width && moved.x <= cloud.wrapWidth;
      }),
    );
  });
});
