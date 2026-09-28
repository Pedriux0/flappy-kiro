// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hitTest, createInputController } from '../../src/shell/inputController.js';
import { UI_BUTTONS } from '../../src/shell/constants.js';

const menu = { state: 'Main_Menu', menu: { bestScoreOpen: false } };
const panelOpen = { state: 'Main_Menu', menu: { bestScoreOpen: true } };
const playing = { state: 'Playing', menu: { bestScoreOpen: false } };
const paused = { state: 'Paused', menu: { bestScoreOpen: false } };
const over = { state: 'Game_Over', menu: { bestScoreOpen: false } };

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

describe('hitTest', () => {
  it('returns visible button ids and null on miss', () => {
    expect(hitTest(centre(UI_BUTTONS.PLAY), UI_BUTTONS, menu)).toBe('PLAY');
    expect(hitTest(centre(UI_BUTTONS.HIGH_SCORES), UI_BUTTONS, menu)).toBe('HIGH_SCORES');
    expect(hitTest(centre(UI_BUTTONS.BACK), UI_BUTTONS, panelOpen)).toBe('BACK');
    expect(hitTest(centre(UI_BUTTONS.PAUSE), UI_BUTTONS, playing)).toBe('PAUSE');
    expect(hitTest(centre(UI_BUTTONS.RESUME), UI_BUTTONS, paused)).toBe('RESUME');
    expect(hitTest(centre(UI_BUTTONS.RESTART), UI_BUTTONS, over)).toBe('RESTART');
    expect(hitTest({ x: 5, y: 600 }, UI_BUTTONS, menu)).toBeNull();
  });

  it('ignores buttons not visible in the current state', () => {
    expect(hitTest(centre(UI_BUTTONS.PLAY), UI_BUTTONS, playing)).toBeNull();
    expect(hitTest(centre(UI_BUTTONS.PLAY), UI_BUTTONS, panelOpen)).toBeNull();
  });

  it('returns HIGH_SCORES anywhere inside its rect at every scale, only when visible (R18.1, R18.2)', () => {
    const b = UI_BUTTONS.HIGH_SCORES;
    const inside = [
      centre(b),
      { x: b.x + 1, y: b.y + 1 },
      { x: b.x + b.width - 1, y: b.y + b.height - 1 },
    ];
    for (const s of [0.5, 0.75, 1, 2]) {
      for (const p of inside) {
        expect(hitTest(p, UI_BUTTONS, menu, s)).toBe('HIGH_SCORES');
        for (const w of [panelOpen, playing, paused, over]) {
          expect(hitTest(p, UI_BUTTONS, w, s)).not.toBe('HIGH_SCORES');
        }
      }
    }
  });

  it('uses the grown display rect at small scales (R18.8)', () => {
    const b = UI_BUTTONS.PAUSE; // 48x48 → 88x88 at s = 0.5
    const p = { x: b.x + b.width / 2, y: b.y + b.height + 10 };
    expect(hitTest(p, UI_BUTTONS, playing, 1)).toBeNull();
    expect(hitTest(p, UI_BUTTONS, playing, 0.5)).toBe('PAUSE');
  });
});

describe('createInputController', () => {
  let canvas;
  let panel;
  let world;
  let onToggleMute;
  let ctrl;

  const key = (k, opts = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
    (opts.target ?? window).dispatchEvent(e);
    return e;
  };
  const click = (x, y, el = canvas) =>
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
  const touch = (x, y) => {
    const e = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
    canvas.dispatchEvent(e);
    return e;
  };

  beforeEach(() => {
    canvas = document.createElement('canvas');
    panel = document.createElement('div');
    document.body.append(canvas, panel);
    world = menu;
    onToggleMute = vi.fn();
    ctrl = createInputController({
      target: canvas,
      keyTarget: window,
      getWorld: () => world,
      isPanelTarget: (t) => panel.contains(t),
      onToggleMute,
    });
  });

  afterEach(() => {
    ctrl.dispose();
    document.body.innerHTML = '';
  });

  it('drains an all-false frame when idle', () => {
    const f = ctrl.drainInputBuffer();
    expect(Object.keys(f).sort()).toEqual([
      'backPressed', 'escape', 'flap', 'highScoresPressed', 'playPressed',
      'pointer', 'restart', 'startKey', 'toggleBestScore', 'togglePause',
    ]);
    expect(Object.values(f).every((v) => v === false)).toBe(true);
  });

  it('maps keys and collapses repeated events into one frame', () => {
    const space = key(' ');
    key(' ');
    expect(space.defaultPrevented).toBe(true);
    let f = ctrl.drainInputBuffer();
    expect(f.flap && f.startKey).toBe(true);
    expect(ctrl.drainInputBuffer().flap).toBe(false);

    key('Enter');
    f = ctrl.drainInputBuffer();
    expect(f.startKey).toBe(true);
    expect(f.flap).toBe(false);

    key('p'); key('H'); key('Escape');
    f = ctrl.drainInputBuffer();
    expect(f).toMatchObject({ togglePause: true, toggleBestScore: true, escape: true, flap: false });

    key('M'); key('m');
    expect(onToggleMute).toHaveBeenCalledTimes(2);
  });

  it('drops auto-repeat keydowns but still prevents Space scrolling', () => {
    const e = key(' ', { repeat: true });
    key('h', { repeat: true });
    key('Escape', { repeat: true });
    key('m', { repeat: true });
    expect(e.defaultPrevented).toBe(true);
    expect(Object.values(ctrl.drainInputBuffer()).every((v) => v === false)).toBe(true);
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('a held H or Escape toggles once across later frames (R18.10)', () => {
    for (const [k, flag] of [['h', 'toggleBestScore'], ['Escape', 'escape']]) {
      key(k);
      expect(ctrl.drainInputBuffer()[flag]).toBe(true);
      let count = 0;
      for (let i = 0; i < 5; i++) {
        key(k, { repeat: true });
        key(k, { repeat: true });
        if (ctrl.drainInputBuffer()[flag]) count++;
      }
      expect(count).toBe(0);
    }
  });

  it('maps pointer hits to button flags and misses to pointer + flap', () => {
    let p = centre(UI_BUTTONS.PLAY);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer()).toMatchObject({ playPressed: true, pointer: false, flap: false });

    p = centre(UI_BUTTONS.HIGH_SCORES);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer().highScoresPressed).toBe(true);

    world = panelOpen;
    p = centre(UI_BUTTONS.BACK);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer().backPressed).toBe(true);

    world = over;
    p = centre(UI_BUTTONS.RESTART);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer().restart).toBe(true);

    world = paused;
    p = centre(UI_BUTTONS.RESUME);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer().togglePause).toBe(true);

    world = playing;
    p = centre(UI_BUTTONS.PAUSE);
    click(p.x, p.y);
    expect(ctrl.drainInputBuffer().togglePause).toBe(true);

    click(100, 200);
    expect(ctrl.drainInputBuffer()).toMatchObject({ pointer: true, flap: true, togglePause: false });
  });

  it('handles touchstart with preventDefault using the first changed touch', () => {
    world = playing;
    const e = touch(100, 200);
    expect(e.defaultPrevented).toBe(true);
    expect(ctrl.drainInputBuffer()).toMatchObject({ pointer: true, flap: true });
  });

  it('ignores events targeting the tuning panel (R17.9)', () => {
    world = playing;
    const input = document.createElement('input');
    panel.append(input);
    key(' ', { target: input });
    click(100, 200, input);
    expect(Object.values(ctrl.drainInputBuffer()).every((v) => v === false)).toBe(true);
  });

  it('applies toLogical before hit-testing', () => {
    ctrl.dispose();
    const p = centre(UI_BUTTONS.PLAY);
    ctrl = createInputController({
      target: canvas,
      toLogical: (cx, cy) => ({ x: cx * 2, y: cy * 2 }),
      getWorld: () => menu,
    });
    click(p.x / 2, p.y / 2);
    expect(ctrl.drainInputBuffer().playPressed).toBe(true);
  });

  it('dispose removes listeners', () => {
    ctrl.dispose();
    key(' ');
    click(100, 200);
    expect(ctrl.drainInputBuffer().flap).toBe(false);
  });
});
