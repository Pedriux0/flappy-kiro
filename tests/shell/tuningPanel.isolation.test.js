// @vitest-environment jsdom
// Tuning_Panel isolation and no-persistence tests (task 10.6; R17.8, R17.9).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createTuningPanel } from '../../src/shell/tuningPanel.js';
import { createInputController } from '../../src/shell/inputController.js';
import { DEFAULT_CONFIG, CONFIG_SCHEMA } from '../../src/core/config.js';
import { STORAGE_KEY } from '../../src/shell/constants.js';

globalThis.__FLAPPY_KIRO_NO_AUTOBOOT__ = true;

let boot;
beforeAll(async () => {
  ({ boot } = await import('../../src/main.js'));
});

/** Recording 2D context (jsdom has no canvas implementation). */
function mockCtx() {
  const target = { canvas: { width: 480, height: 640 } };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    set: (t, p, v) => { t[p] = v; return true; },
  });
}

function setupDom() {
  document.body.innerHTML = '<main id="game-container"><canvas id="game"></canvas></main>';
  const canvas = document.getElementById('game');
  canvas.getContext = () => mockCtx();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 640, right: 480, bottom: 640 });
  return { canvas, container: document.getElementById('game-container') };
}

/** Standalone panel over a plain config holder. */
function makePanel(parent, keyTarget) {
  let config = DEFAULT_CONFIG;
  const panel = createTuningPanel({
    search: '?debug=1',
    schema: CONFIG_SCHEMA,
    getConfig: () => config,
    setConfig: (next) => { config = next; },
    parent,
    keyTarget,
    clipboard: null,
  });
  panel.toggle(); // visible, as a Developer would use it
  return { panel, getConfig: () => config };
}

function panelInput(panel) {
  return panel.root.querySelector('input[type="range"][data-key="physics.gravity"]');
}

/** Fire mousedown, touchstart, and Space keydown on `el` (all bubbling). */
function firePanelInteractions(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
  const touch = new Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(touch, 'changedTouches', { value: [{ clientX: 10, clientY: 10 }] });
  el.dispatchEvent(touch);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
}

/** Controller with no buttons, so any accepted pointer is a generic flap. */
function makeInput({ target, keyTarget, isPanelTarget }) {
  return createInputController({
    target,
    keyTarget,
    getWorld: () => ({ state: 'Playing' }),
    buttons: [],
    ...(isPanelTarget ? { isPanelTarget } : {}),
  });
}

describe('Tuning_Panel input isolation (R17.9)', () => {
  let cleanup = [];
  beforeEach(() => { cleanup = []; });
  afterEach(() => { cleanup.forEach((fn) => fn()); });

  it('control: without isPanelTarget, listeners on the panel root itself register a flap', () => {
    // stopPropagation on the root does not stop other listeners on the same node,
    // so this setup genuinely depends on isPanelTarget.
    const { container } = setupDom();
    const { panel } = makePanel(container, container);
    const input = makeInput({ target: panel.root, keyTarget: panel.root });
    cleanup.push(() => input.dispose(), () => panel.dispose());

    firePanelInteractions(panelInput(panel));
    const frame = input.drainInputBuffer();
    expect(frame.flap).toBe(true);
    expect(frame.pointer).toBe(true);
  });

  it('(a) target/keyTarget = panel root: isPanelTarget = panel.contains suppresses mousedown, touchstart, Space', () => {
    const { container } = setupDom();
    const { panel } = makePanel(container, container);
    const input = makeInput({
      target: panel.root,
      keyTarget: panel.root,
      isPanelTarget: (t) => panel.contains(t),
    });
    cleanup.push(() => input.dispose(), () => panel.dispose());

    firePanelInteractions(panelInput(panel));
    const frame = input.drainInputBuffer();
    expect(frame.flap).toBe(false);
    expect(frame.pointer).toBe(false);
    expect(frame.startKey).toBe(false);
  });

  it('(a) target/keyTarget = the container holding the panel: panel events yield flap false, canvas events still flap', () => {
    const { container, canvas } = setupDom();
    const { panel } = makePanel(container, container);
    const input = makeInput({
      target: container,
      keyTarget: container,
      isPanelTarget: (t) => panel.contains(t),
    });
    cleanup.push(() => input.dispose(), () => panel.dispose());

    firePanelInteractions(panelInput(panel));
    const frame = input.drainInputBuffer();
    expect(frame.flap).toBe(false);
    expect(frame.pointer).toBe(false);
    expect(frame.startKey).toBe(false);

    // Sanity: the same controller still accepts non-panel input.
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(input.drainInputBuffer().flap).toBe(true);
  });

  it('(b) keyTarget = window, target = canvas: panel events yield flap false, window Space still flaps', () => {
    const { container, canvas } = setupDom();
    const { panel } = makePanel(container, window);
    const input = makeInput({
      target: canvas,
      keyTarget: window,
      isPanelTarget: (t) => panel.contains(t),
    });
    cleanup.push(() => input.dispose(), () => panel.dispose());

    const el = panelInput(panel);
    firePanelInteractions(el);
    // Number input too (typing a space in a text-like field).
    firePanelInteractions(panel.root.querySelector('input[type="number"]'));
    const frame = input.drainInputBuffer();
    expect(frame.flap).toBe(false);
    expect(frame.pointer).toBe(false);
    expect(frame.startKey).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    expect(input.drainInputBuffer().flap).toBe(true);
  });
});

describe('Tuning_Panel no persistence (R17.8)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  const deps = () => ({
    // storage omitted → real jsdom localStorage
    keyTarget: window,
    search: '?debug=1',
    seed: 1,
    loadSprite: async () => null,
    createAudio: () => ({ play: () => Promise.resolve(), load() {}, currentTime: 0 }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    raf: () => 1,
    caf: () => {},
  });

  it('edits touch neither localStorage nor the URL; a fresh boot starts from DEFAULT_CONFIG', async () => {
    const defaultsSnapshot = structuredClone(DEFAULT_CONFIG);
    const hrefBefore = window.location.href;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    // First session: edit several values through the panel.
    setupDom();
    const first = await boot(deps());
    expect(first.panel).not.toBeNull();
    const range = first.panel.root.querySelector('input[type="range"][data-key="physics.gravity"]');
    range.value = '2000';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    const number = first.panel.root.querySelector('input[type="number"][data-key="physics.flapVelocity"]');
    number.value = '-450';
    number.dispatchEvent(new Event('change', { bubbles: true }));
    first.loop.tick(0);
    first.loop.tick(16);
    expect(first.loop.getConfig().physics.gravity).toBe(2000);
    expect(first.loop.getConfig().physics.flapVelocity).toBe(-450);

    // Nothing persisted: no storage writes, only (possibly) the high-score key present.
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    for (let i = 0; i < localStorage.length; i += 1) {
      expect(localStorage.key(i)).toBe(STORAGE_KEY);
    }
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);

    first.panel.dispose();
    first.input.dispose();
    first.loop.stop?.();

    // Second session ("reload") with the same storage and search.
    setupDom();
    const second = await boot(deps());
    expect(second.loop.getConfig()).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual(defaultsSnapshot); // edits never mutated the defaults
    const secondRange = second.panel.root.querySelector('input[type="range"][data-key="physics.gravity"]');
    expect(Number(secondRange.value)).toBe(DEFAULT_CONFIG.physics.gravity);
    expect(setItem).not.toHaveBeenCalled();

    second.panel.dispose();
    second.input.dispose();
    second.loop.stop?.();
  });
});
