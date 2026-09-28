// Feature: flappy-kiro, Property 29: For any valid config, parsing the output of serializeConfig(config) as a JS object literal yields a config deeply equal to the original.
// **Validates: Requirements 17.7**
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeConfig } from "../../src/core/config.js";
import { validConfigArb } from "../arbitraries/config.js";

const PREFIX = "export const DEFAULT_CONFIG =";

/** Strip the export prefix and trailing `;`, then evaluate the object literal. */
function parseSerialized(text) {
  expect(text.startsWith(PREFIX)).toBe(true);
  expect(text.endsWith(";")).toBe(true);
  const literal = text.slice(PREFIX.length, -1).trim();
  return new Function("return (" + literal + ")")();
}

describe("serializeConfig", () => {
  it("Property 29: config serialization round-trips", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        // validConfigArb clones DEFAULT_CONFIG into plain objects/arrays, so
        // prototypes already match the evaluated literal; no normalisation needed.
        const parsed = parseSerialized(serializeConfig(config));
        expect(parsed).toStrictEqual(config);
      }),
      { numRuns: 200 }
    );
  });
});
