// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

globalThis.__FLAPPY_KIRO_NO_AUTOBOOT__ = true;

let boot;
beforeAll(async () => {
  ({ boot } = await import('../../src/main.js'));
});

/** Recording 2D context (jsdom has no canvas implementation). */
function mockCtx() {
  const calls = [];
  const target = { calls, canvas: { width: 480, height: 640 } };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : (...args) => calls.push([p, ...args])),
    set: (t, p, v) => { t[p] = v; return true; },
  });
}

function setupDom({ withCtx = true } = {}) {
  document.body.innerHTML = '<main id="game-container"><canvas id="game"></canvas></main>';
  const canvas = document.getElementById('game');
  const ctx = mockCtx();
  canvas.getContext = () => (withCtx ? ctx : null);
  // Displayed at half size: 240×320 CSS px at (10, 20).
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 240, height: 320, right: 250, bottom: 340 });
  return { canvas, ctx };
}

function memoryStorage(init = {}) {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

const baseDeps = () => ({
  storage: memoryStorage({ 'flappy-kiro.highScore': '42' }),
  seed: 1,
  loadSprite: async () => null,
  createAudio: () => ({ play: () => Promise.resolve(), load() {}, currentTime: 0 }),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  raf: () => 1,
  caf: () => {},
});

afterEach(() => vi.restoreAllMocks());

describe('main boot', () => {
  it('logs one error and stops when the 2D context is unavailable', async () => {
    setupDom({ withCtx: false });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await boot(baseDeps());
    expect(result).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('boots to Main_Menu with the loaded high score and renders a frame', async () => {
    const { canvas, ctx } = setupDom();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = await boot(baseDeps());
    expect(app).not.toBeNull();
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(640);
    expect(warn).not.toHaveBeenCalled(); // DEFAULT_CONFIG is valid (R16.6)
    expect(app.loop.isRunning()).toBe(true);
    const world = app.loop.getWorld();
    expect(world.state).toBe('Main_Menu');
    expect(world.highScore).toBe(42);
    app.loop.tick(0);
    expect(ctx.calls.some((c) => c[0] === 'fillText')).toBe(true);
    app.input.dispose();
  });

  it('warns on an invalid config but still boots (R16.3)', async () => {
    setupDom();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = await boot({ ...baseDeps(), config: { ...(await import('../../src/core/config.js')).DEFAULT_CONFIG, pipeWidth: 5 } });
    expect(warn).toHaveBeenCalled();
    expect(app.loop.getWorld().state).toBe('Main_Menu');
    app.input.dispose();
  });

  it('M toggles mute; a click on PLAY maps through the display scale and starts the game', async () => {
    const { canvas } = setupDom();
    const app = await boot({ ...baseDeps(), keyTarget: window });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(app.audio.isMuted()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(app.audio.isMuted()).toBe(false);
    // PLAY centre in logical px (240, 400) → client (10 + 120, 20 + 200).
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 130, clientY: 220 }));
    app.loop.tick(0);
    expect(app.loop.getWorld().state).toBe('Playing');
    app.input.dispose();
  });
});

describe('main boot: Tuning_Panel wiring (R17)', () => {
  it('without ?debug=1 no panel is created (R17.2)', async () => {
    setupDom();
    const app = await boot({ ...baseDeps(), search: '' });
    expect(app.panel).toBeNull();
    expect(document.querySelector('.tuning-panel')).toBeNull();
    app.input.dispose();
  });

  it('with ?debug=1 mounts the panel in #game-container; edits change config without resetting the world (R17.1, R17.5, R17.10)', async () => {
    const { canvas } = setupDom();
    const app = await boot({ ...baseDeps(), keyTarget: window, search: '?debug=1' });
    expect(app.panel).not.toBeNull();
    expect(app.panel.root.parentElement).toBe(document.getElementById('game-container'));

    // Start a session so there is world state to preserve.
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 130, clientY: 220 }));
    app.loop.tick(0);
    app.loop.tick(16);
    const worldBefore = app.loop.getWorld();
    expect(worldBefore.state).toBe('Playing');

    const range = app.panel.root.querySelector('input[type="range"][data-key="physics.gravity"]');
    range.value = '2000';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(app.loop.getConfig().physics.gravity).toBe(2000);
    expect(app.loop.getWorld()).toBe(worldBefore); // no reset
    app.loop.tick(32);
    expect(app.loop.getWorld().state).toBe('Playing');

    // Panel interactions never flap (R17.9).
    app.input.drainInputBuffer();
    range.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    range.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const frame = app.input.drainInputBuffer();
    expect(frame.flap).toBe(false);
    expect(frame.pointer).toBe(false);

    app.panel.dispose();
    app.input.dispose();
  });
});
