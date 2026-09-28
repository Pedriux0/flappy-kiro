// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_SCHEMA, DEFAULT_CONFIG } from "../../src/core/config.js";
import { createTuningPanel } from "../../src/shell/tuningPanel.js";

const PANEL_KEYS = CONFIG_SCHEMA.filter((e) => e.panel).map((e) => e.key);

function setup(search = "?debug=1") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  let config = DEFAULT_CONFIG;
  const setConfig = vi.fn((next) => {
    config = next;
  });
  const panel = createTuningPanel({
    search,
    schema: CONFIG_SCHEMA,
    getConfig: () => config,
    setConfig,
    parent,
    keyTarget: window,
  });
  return { parent, panel, setConfig, getConfig: () => config };
}

const inputs = (panel, key) => {
  const id = `tuning-${key.replace(/\./g, "-")}`;
  return {
    range: panel.root.querySelector(`#${id}`),
    number: panel.root.querySelector(`#${id}-value`),
  };
};

const fire = (el, type, value) => {
  el.value = value;
  el.dispatchEvent(new Event(type, { bubbles: true }));
};

const pressD = (target = window, init = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true, ...init }));

let current;
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  current?.panel?.dispose();
  document.body.innerHTML = "";
  current = undefined;
});

describe("createTuningPanel enablement (R17.1, R17.2)", () => {
  it.each(["", "?debug=0", "?debug=true", "?foo=1"])("returns null and creates no DOM for %j", (search) => {
    const addSpy = vi.spyOn(window, "addEventListener");
    current = setup(search);
    expect(current.panel).toBeNull();
    expect(current.parent.children).toHaveLength(0);
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
    // D does nothing: no panel DOM appears anywhere and config is never set
    pressD();
    pressD(window, { key: "D" });
    expect(document.body.children).toHaveLength(1);
    expect(current.parent.children).toHaveLength(0);
    expect(document.body.querySelector(".tuning-panel, input")).toBeNull();
    expect(current.setConfig).not.toHaveBeenCalled();
  });

  it("creates a hidden panel inside parent with ?debug=1", () => {
    current = setup("?x=2&debug=1");
    expect(current.panel).not.toBeNull();
    expect(current.parent.contains(current.panel.root)).toBe(true);
    expect(current.panel.root.hidden).toBe(true);
    expect(current.panel.isVisible()).toBe(false);
  });
});

describe("controls (R17.4)", () => {
  it("renders one labelled range + number row per panel entry with schema bounds and current values", () => {
    current = setup();
    const { panel } = current;
    expect(panel.root.querySelectorAll(".tuning-panel__row")).toHaveLength(PANEL_KEYS.length);
    for (const entry of CONFIG_SCHEMA.filter((e) => e.panel)) {
      const { range, number } = inputs(panel, entry.key);
      expect(range.type).toBe("range");
      expect(number.type).toBe("number");
      for (const el of [range, number]) {
        expect(Number(el.min)).toBe(entry.min);
        expect(Number(el.max)).toBe(entry.max);
        expect(Number(el.step)).toBe(entry.step);
      }
      const label = panel.root.querySelector(`label[for="${range.id}"]`);
      expect(label.textContent).toBe(entry.label);
      expect(number.getAttribute("aria-label")).toBe(`${entry.label} value`);
      const expected = entry.key.split(".").reduce((o, k) => o[k], DEFAULT_CONFIG);
      expect(Number(number.value)).toBe(expected);
    }
    // panel: false entries are not shown
    expect(panel.root.querySelector("#tuning-pipeWidth")).toBeNull();
  });
});

describe("applying edits (R17.5, R17.6, R17.10)", () => {
  it("applies an in-range range edit immutably and syncs the number input", () => {
    current = setup();
    const before = current.getConfig();
    const { range, number } = inputs(current.panel, "physics.gravity");
    fire(range, "input", "2000");
    expect(current.setConfig).toHaveBeenCalledTimes(1);
    const next = current.getConfig();
    expect(next.physics.gravity).toBe(2000);
    expect(next).not.toBe(before);
    expect(before.physics.gravity).toBe(1600); // original untouched
    expect(number.value).toBe("2000");
  });

  it("clamps an out-of-range number entry on change and syncs both inputs", () => {
    current = setup();
    const before = current.getConfig();
    const snapshot = structuredClone(before);
    const { range, number } = inputs(current.panel, "ghostHitboxRadius");
    fire(number, "change", "99");
    expect(current.setConfig).toHaveBeenCalledTimes(1);
    const passed = current.setConfig.mock.calls[0][0];
    expect(passed).not.toBe(before);
    expect(passed.ghostHitboxRadius).toBe(16);
    expect(before).toEqual(snapshot); // prior config deep-unchanged
    expect(current.getConfig().ghostHitboxRadius).toBe(16);
    expect(number.value).toBe("16");
    expect(range.value).toBe("16");
  });

  it("falls back to the current value for non-numeric input on change", () => {
    current = setup();
    const { number } = inputs(current.panel, "gapHeight");
    fire(number, "change", "abc");
    expect(current.getConfig().gapHeight).toBe(DEFAULT_CONFIG.gapHeight);
    expect(number.value).toBe(String(DEFAULT_CONFIG.gapHeight));
  });

  it("ignores non-numeric partial typing on number input events", () => {
    current = setup();
    const { number } = inputs(current.panel, "gapHeight");
    fire(number, "input", "");
    expect(current.setConfig).not.toHaveBeenCalled();
  });

  it("writes nothing to localStorage or the URL (R17.8)", () => {
    current = setup();
    const href = window.location.href;
    fire(inputs(current.panel, "speedStep").range, "input", "30");
    expect(localStorage.length).toBe(0);
    expect(window.location.href).toBe(href);
  });
});

describe("visibility and input isolation (R17.3, R17.9)", () => {
  it("toggles on D/d keydown and ignores repeats and modifier combos", () => {
    current = setup();
    const { panel } = current;
    pressD();
    expect(panel.isVisible()).toBe(true);
    pressD(window, { key: "D" });
    expect(panel.isVisible()).toBe(false);
    pressD(window, { repeat: true });
    pressD(window, { ctrlKey: true });
    expect(panel.isVisible()).toBe(false);
    panel.toggle();
    expect(panel.root.hidden).toBe(false);
  });

  it("stops mousedown, touchstart, click and keydown at the panel root", () => {
    current = setup();
    const { panel } = current;
    panel.toggle();
    const seen = [];
    const listener = (e) => seen.push(e.type);
    const types = ["mousedown", "touchstart", "click", "keydown"];
    for (const t of types) window.addEventListener(t, listener);
    const { number } = inputs(panel, "physics.gravity");
    for (const t of types) number.dispatchEvent(new Event(t, { bubbles: true }));
    // "d" typed inside the panel neither reaches window nor toggles the panel
    number.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    for (const t of types) window.removeEventListener(t, listener);
    expect(seen).toEqual([]);
    expect(panel.isVisible()).toBe(true);
  });

  it("contains() reports panel descendants only", () => {
    current = setup();
    const { panel } = current;
    expect(panel.contains(inputs(panel, "gapHeight").range)).toBe(true);
    expect(panel.contains(document.body)).toBe(false);
    expect(panel.contains(null)).toBe(false);
  });

  it("dispose() removes the root and the D listener", () => {
    current = setup();
    const { panel, parent } = current;
    panel.dispose();
    expect(parent.contains(panel.root)).toBe(false);
    pressD();
    expect(panel.isVisible()).toBe(false);
    current = undefined;
  });
});
