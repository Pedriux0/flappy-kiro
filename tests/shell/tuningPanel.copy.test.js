// @vitest-environment jsdom
// Copy control (R17.7). Task 10.5 extends this file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_SCHEMA, DEFAULT_CONFIG, serializeConfig } from "../../src/core/config.js";
import { createTuningPanel } from "../../src/shell/tuningPanel.js";

function setup(extra = {}) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const panel = createTuningPanel({
    search: "?debug=1",
    schema: CONFIG_SCHEMA,
    getConfig: () => DEFAULT_CONFIG,
    setConfig: () => {},
    parent,
    keyTarget: window,
    ...extra,
  });
  return { panel, expected: serializeConfig(DEFAULT_CONFIG) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TuningPanel copy control", () => {
  it("writes serializeConfig(getConfig()) to the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { panel, expected } = setup({ clipboard: { writeText } });
    const button = panel.root.querySelector("button.tuning-panel__copy");
    expect(button.type).toBe("button");
    await expect(panel.copyConfig()).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(panel.root.querySelector("textarea")).toBeNull();
  });

  it.each([
    ["missing API", undefined],
    ["rejecting promise", { writeText: () => Promise.reject(new Error("denied")) }],
    ["sync throw", { writeText: () => { throw new Error("boom"); } }],
  ])("falls back to a selected, reused textarea on %s", async (_name, clipboard) => {
    const { panel, expected } = setup({ clipboard });
    await expect(panel.copyConfig()).resolves.toBe("fallback");
    await panel.copyConfig();
    const areas = panel.root.querySelectorAll("textarea");
    expect(areas).toHaveLength(1);
    const area = areas[0];
    expect(area.value).toBe(expected);
    expect(area.readOnly).toBe(true);
    expect(area.getAttribute("aria-label")).toBeTruthy();
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(expected.length);
  });
});

// --- Task 10.5: button click path, default navigator.clipboard, edited config ---

/** Panel with live config state and NO `clipboard` option (navigator path). */
function setupLive() {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  let config = DEFAULT_CONFIG;
  const panel = createTuningPanel({
    search: "?debug=1",
    schema: CONFIG_SCHEMA,
    getConfig: () => config,
    setConfig: (next) => { config = next; },
    parent,
    keyTarget: window,
  });
  // Edit gravity through the real number input so the config differs from default.
  const number = panel.root.querySelector('input[type="number"][data-key="physics.gravity"]');
  number.value = "1230";
  number.dispatchEvent(new Event("change", { bubbles: true }));
  const current = config;
  expect(current).not.toBe(DEFAULT_CONFIG);
  expect(current.physics.gravity).toBe(1230);
  return { panel, expected: serializeConfig(current) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("TuningPanel copy via button click and navigator.clipboard", () => {
  let saved;
  let unhandled;
  const onUnhandled = (reason) => { unhandled.push(reason); };

  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    if (saved) Object.defineProperty(globalThis.navigator, "clipboard", saved);
    else delete globalThis.navigator.clipboard;
  });

  const stubClipboard = (value) =>
    Object.defineProperty(globalThis.navigator, "clipboard", { value, configurable: true });

  it("click writes serializeConfig(editedConfig) via navigator.clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    const { panel, expected } = setupLive();
    panel.root.querySelector("button.tuning-panel__copy").click();
    await tick();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(panel.root.querySelector("textarea")).toBeNull();
    expect(unhandled).toEqual([]);
  });

  it.each([
    ["navigator.clipboard undefined", () => stubClipboard(undefined)],
    ["navigator.clipboard.writeText rejecting", () =>
      stubClipboard({ writeText: vi.fn(() => Promise.reject(new Error("denied"))) })],
  ])("click with %s shows a selected textarea and nothing escapes", async (_name, arrange) => {
    arrange();
    const { panel, expected } = setupLive();
    panel.root.querySelector("button.tuning-panel__copy").click();
    await tick();
    const area = panel.root.querySelector("textarea");
    expect(area).not.toBeNull();
    expect(area.value).toBe(expected);
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(expected.length);
    expect(unhandled).toEqual([]);
  });
});
