// Developer-only Tuning_Panel (R17). A plain-DOM overlay, absolutely positioned
// over the canvas, with one row per `panel: true` CONFIG_SCHEMA entry.
//
// - Enabled only with `?debug=1`; otherwise returns null and creates no DOM and
//   no listeners, so "D" is ignored (R17.1, R17.2).
// - Starts hidden; a non-repeat "D"/"d" keydown on keyTarget toggles it (R17.3).
//   Keydowns inside the panel stop propagating (R17.9), so typing "d" in a
//   number field never toggles the panel and never reaches window listeners.
// - Edits are clamped with clampToSchema and applied immutably via
//   setConfig(setConfigValue(getConfig(), key, clamped)) (R17.5, R17.6, R17.10).
// - Nothing is written to localStorage or the URL (R17.8).

import { clampToSchema, getConfigValue, serializeConfig, setConfigValue } from "../core/config.js";

/** Events whose propagation stops at the panel root so they never flap (R17.9). */
const ISOLATED_EVENTS = ["mousedown", "touchstart", "click", "keydown"];

/**
 * @param {object} opts
 * @param {string} opts.search location.search
 * @param {Array<{key: string, label: string, min: number, max: number, step: number, panel: boolean}>} opts.schema
 * @param {() => object} opts.getConfig
 * @param {(next: object) => void} opts.setConfig
 * @param {HTMLElement} opts.parent container over the canvas
 * @param {EventTarget} [opts.keyTarget=window] receives the "D" toggle listener
 * @param {{ writeText: (text: string) => Promise<void> } | null} [opts.clipboard]
 *   clipboard override; when omitted, globalThis.navigator?.clipboard is read at click time
 * @returns {null | {
 *   root: HTMLElement,
 *   toggle: () => void,
 *   copyConfig: () => Promise<"copied" | "fallback">,
 *   isVisible: () => boolean,
 *   contains: (target: EventTarget | null) => boolean,
 *   dispose: () => void,
 * }}
 */
export function createTuningPanel(options = {}) {
  const {
    search,
    schema,
    getConfig,
    setConfig,
    parent,
    keyTarget = typeof window !== "undefined" ? window : undefined,
  } = options;
  // Clipboard is resolved at click time. An explicitly passed `clipboard`
  // (even null/undefined) wins; otherwise use globalThis.navigator?.clipboard.
  const hasClipboardOption = Object.prototype.hasOwnProperty.call(options, "clipboard");
  const resolveClipboard = () =>
    hasClipboardOption ? options.clipboard : globalThis.navigator?.clipboard;
  if (new URLSearchParams(search ?? "").get("debug") !== "1") return null; // R17.1, R17.2

  const doc = parent?.ownerDocument ?? document;
  const root = doc.createElement("div");
  root.className = "tuning-panel";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Tuning panel");
  root.hidden = true; // starts hidden (R17.3)

  const title = doc.createElement("h2");
  title.className = "tuning-panel__title";
  title.textContent = "Tuning (D to toggle)";
  root.appendChild(title);

  const rows = doc.createElement("div");
  rows.className = "tuning-panel__rows";
  root.appendChild(rows);

  const entries = (Array.isArray(schema) ? schema : []).filter((e) => e && e.panel === true);
  for (const entry of entries) {
    rows.appendChild(createRow(doc, entry, schema, getConfig, setConfig));
  }

  // Actions area: "Copy config" (R17.7).
  const actions = doc.createElement("div");
  actions.className = "tuning-panel__actions";
  root.appendChild(actions);

  const copyButton = doc.createElement("button");
  copyButton.type = "button";
  copyButton.className = "tuning-panel__copy";
  copyButton.textContent = "Copy config";

  const status = doc.createElement("span");
  status.className = "tuning-panel__status";
  status.setAttribute("aria-live", "polite");

  actions.append(copyButton, status);

  /** @type {HTMLTextAreaElement | null} single reused fallback textarea */
  let fallback = null;
  const showFallback = (text) => {
    if (!fallback) {
      fallback = doc.createElement("textarea");
      fallback.className = "tuning-panel__fallback";
      fallback.readOnly = true;
      fallback.rows = 8;
      fallback.setAttribute("aria-label", "Config (copy manually)");
      actions.appendChild(fallback);
    }
    fallback.value = text;
    try {
      fallback.focus();
      fallback.select();
    } catch {
      // selection is best-effort
    }
    status.textContent = "Clipboard unavailable: copy the text below";
  };

  /**
   * Copies serializeConfig(getConfig()) to the clipboard, or shows a selected
   * fallback textarea. Always resolves (never rejects) to "copied" | "fallback".
   */
  const copyConfig = async () => {
    let text;
    try {
      text = serializeConfig(getConfig());
    } catch {
      status.textContent = "Could not serialize config";
      return "fallback";
    }
    try {
      const clipboard = resolveClipboard();
      if (!clipboard || typeof clipboard.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(text); // sync throws land in the same catch
      status.textContent = "Copied";
      return "copied";
    } catch {
      showFallback(text);
      return "fallback";
    }
  };

  const onCopyClick = () => {
    void copyConfig();
  };
  copyButton.addEventListener("click", onCopyClick);

  // Input isolation (R17.9): panel interactions never reach window listeners.
  const stop = (event) => event.stopPropagation();
  for (const type of ISOLATED_EVENTS) root.addEventListener(type, stop);

  const toggle = () => {
    root.hidden = !root.hidden;
  };

  const onKeyDown = (event) => {
    if (event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return; // leave Ctrl/Cmd+D to the browser
    if (event.key === "d" || event.key === "D") toggle();
  };
  keyTarget?.addEventListener("keydown", onKeyDown);

  parent.appendChild(root);

  return {
    root,
    toggle,
    copyConfig,
    isVisible: () => !root.hidden,
    contains: (target) => {
      try {
        return Boolean(target) && root.contains(target);
      } catch {
        return false;
      }
    },
    dispose: () => {
      keyTarget?.removeEventListener("keydown", onKeyDown);
      copyButton.removeEventListener("click", onCopyClick);
      for (const type of ISOLATED_EVENTS) root.removeEventListener(type, stop);
      root.remove();
    },
  };
}

/**
 * One labelled row: <label>, linked range and number inputs (R17.4).
 * The label's `for` points at the range input; the number input gets its own
 * aria-label so both controls have accessible names.
 */
function createRow(doc, entry, schema, getConfig, setConfig) {
  const { key, label, min, max, step } = entry;
  const id = `tuning-${String(key).replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const current = () => Number(getConfigValue(getConfig(), key));

  const row = doc.createElement("div");
  row.className = "tuning-panel__row";

  const labelEl = doc.createElement("label");
  labelEl.className = "tuning-panel__label";
  labelEl.htmlFor = id;
  labelEl.textContent = label;

  const range = doc.createElement("input");
  range.type = "range";
  range.id = id;
  range.className = "tuning-panel__range";

  const number = doc.createElement("input");
  number.type = "number";
  number.id = `${id}-value`;
  number.className = "tuning-panel__number";
  number.setAttribute("aria-label", `${label} value`);

  for (const input of [range, number]) {
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.key = key;
  }
  const initial = current();
  range.value = String(initial);
  number.value = String(initial);

  // Parse → fall back to the current value if non-numeric → clamp → sync → apply.
  // While typing in the number field (`input`), a non-numeric partial entry
  // (e.g. "" or "-") is left alone, and the typed text is not rewritten, so
  // the Developer can finish typing; `change` (commit) always syncs both.
  const apply = (source, rewriteSource) => {
    const parsed = Number.parseFloat(source.value);
    const value = Number.isFinite(parsed) ? parsed : current();
    const clamped = clampToSchema(key, value, schema); // R17.6
    range.value = String(clamped);
    if (rewriteSource || source !== number) number.value = String(clamped);
    setConfig(setConfigValue(getConfig(), key, clamped)); // R17.5, R17.10
  };

  range.addEventListener("input", () => apply(range, true));
  range.addEventListener("change", () => apply(range, true));
  number.addEventListener("input", () => {
    if (Number.isFinite(Number.parseFloat(number.value))) apply(number, false);
  });
  number.addEventListener("change", () => apply(number, true));

  row.append(labelEl, range, number);
  return row;
}
