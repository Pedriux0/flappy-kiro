import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_KEY, ASSET_PATHS, MAX_DT, LOGICAL_WIDTH, LOGICAL_HEIGHT,
  SPRITE_LOAD_TIMEOUT_MS, createPlayArea, UI_BUTTONS, displayRect,
} from '../../src/shell/constants.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const world = (state, bestScoreOpen = false) => ({ state, menu: { bestScoreOpen } });

describe('shell constants', () => {
  it('exposes structural constants', () => {
    expect(typeof STORAGE_KEY).toBe('string');
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
    expect(MAX_DT).toBeCloseTo(1 / 30);
    expect([LOGICAL_WIDTH, LOGICAL_HEIGHT]).toEqual([480, 640]);
    expect(SPRITE_LOAD_TIMEOUT_MS).toBe(5000);
  });

  it('asset paths point at existing files', () => {
    expect(Object.values(ASSET_PATHS).sort()).toEqual(
      ['assets/game_over.wav', 'assets/ghosty.png', 'assets/jump.wav'],
    );
    for (const p of Object.values(ASSET_PATHS)) expect(existsSync(root + p)).toBe(true);
  });

  it('createPlayArea returns a fresh, consistent play area', () => {
    const a = createPlayArea();
    expect(a).toEqual({ width: 480, height: 640, groundY: 600, ceilingY: 0 });
    expect(createPlayArea()).not.toBe(a);
  });
});

describe('UI_BUTTONS', () => {
  const buttons = Object.values(UI_BUTTONS);

  it('has every button id, ≥44×44, inside the canvas, with a label', () => {
    expect(Object.keys(UI_BUTTONS).sort()).toEqual(
      ['BACK', 'HIGH_SCORES', 'PAUSE', 'PLAY', 'RESTART', 'RESUME'],
    );
    for (const b of buttons) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(LOGICAL_WIDTH);
      expect(b.y + b.height).toBeLessThanOrEqual(createPlayArea().groundY);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it('PLAY and HIGH_SCORES do not overlap, even grown at scale 0.5', () => {
    const { PLAY, HIGH_SCORES } = UI_BUTTONS;
    expect(overlaps(PLAY, HIGH_SCORES)).toBe(false);
    for (const s of [0.5, 0.75, 1, 2]) {
      expect(overlaps(displayRect(PLAY, s), displayRect(HIGH_SCORES, s))).toBe(false);
    }
  });

  it('visibleIn maps states to buttons', () => {
    const visible = (w) => buttons.filter((b) => b.visibleIn(w)).map((b) => b.id).sort();
    expect(visible(world('Main_Menu'))).toEqual(['HIGH_SCORES', 'PLAY']);
    expect(visible(world('Main_Menu', true))).toEqual(['BACK']);
    expect(visible(world('Playing'))).toEqual(['PAUSE']);
    expect(visible(world('Paused'))).toEqual(['RESUME']);
    expect(visible(world('Game_Over'))).toEqual(['RESTART']);
  });
});

describe('displayRect', () => {
  it('keeps displayed size ≥44 CSS px and preserves the centre', () => {
    for (const b of Object.values(UI_BUTTONS)) {
      for (const s of [0.5, 0.75, 1, 2]) {
        const r = displayRect(b, s);
        expect(r.width * s).toBeGreaterThanOrEqual(44 - 1e-9);
        expect(r.height * s).toBeGreaterThanOrEqual(44 - 1e-9);
        expect(r.x + r.width / 2).toBeCloseTo(b.x + b.width / 2);
        expect(r.y + r.height / 2).toBeCloseTo(b.y + b.height / 2);
      }
    }
  });

  it('grows small rects and never shrinks', () => {
    expect(displayRect({ x: 10, y: 10, width: 20, height: 20 }, 0.5))
      .toEqual({ x: -24, y: -24, width: 88, height: 88 });
    expect(displayRect({ x: 0, y: 0, width: 200, height: 56 }, 2))
      .toEqual({ x: 0, y: 0, width: 200, height: 56 });
  });
});
