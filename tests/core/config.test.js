import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  CONFIG_SCHEMA,
  DEFAULT_HITBOX_RADIUS,
  getConfigValue,
  validateConfig,
  clampToSchema,
  resolveConfig,
  setConfigValue,
  serializeConfig,
} from "../../src/core/config.js";

const withOverrides = (overrides) => ({
  ...DEFAULT_CONFIG,
  physics: { ...DEFAULT_CONFIG.physics },
  ...overrides,
});

describe("DEFAULT_CONFIG", () => {
  it("matches the requirement-bound defaults (R14.1-14.3, R15.2, R16.7)", () => {
    expect(DEFAULT_CONFIG.physics).toEqual({ gravity: 1600, flapVelocity: -450, terminalVelocity: 700 });
    expect(DEFAULT_CONFIG.speedUpInterval).toBe(5);
    expect(DEFAULT_CONFIG.ghostWidth).toBe(32);
    expect(DEFAULT_CONFIG.ghostHeight).toBe(32);
    expect(DEFAULT_CONFIG.ghostHitboxRadius).toBe(12);
    expect(DEFAULT_HITBOX_RADIUS).toBe(12);
  });

  it("sits inside every schema range", () => {
    for (const entry of CONFIG_SCHEMA) {
      const value = getConfigValue(DEFAULT_CONFIG, entry.key);
      expect(Number.isFinite(value), entry.key).toBe(true);
      expect(value, entry.key).toBeGreaterThanOrEqual(entry.min);
      expect(value, entry.key).toBeLessThanOrEqual(entry.max);
    }
  });
});

describe("CONFIG_SCHEMA", () => {
  it("has 17 unique entries", () => {
    expect(CONFIG_SCHEMA).toHaveLength(17);
    expect(new Set(CONFIG_SCHEMA.map((e) => e.key)).size).toBe(17);
  });

  it("marks every R17.4 tunable and ghostHitboxRadius as panel controls", () => {
    const panelKeys = CONFIG_SCHEMA.filter((e) => e.panel).map((e) => e.key);
    expect(panelKeys.sort()).toEqual(
      [
        "physics.gravity",
        "physics.flapVelocity",
        "physics.terminalVelocity",
        "basePipeSpeed",
        "maxPipeSpeed",
        "speedStep",
        "speedUpInterval",
        "gapHeight",
        "spawnDistance",
        "ghostHitboxRadius",
      ].sort(),
    );
    const radius = CONFIG_SCHEMA.find((e) => e.key === "ghostHitboxRadius");
    expect([radius.min, radius.max]).toEqual([8, 16]);
  });

  it("bounds visual values per R12.1-12.4, R12.6 and R19.8", () => {
    const bounds = (key) => {
      const entry = CONFIG_SCHEMA.find((e) => e.key === key);
      expect(entry, key).toBeDefined();
      return [entry.min, entry.max];
    };
    expect(bounds("ghostWidth")).toEqual([24, 48]); // R12.1
    expect(bounds("ghostHeight")).toEqual([24, 48]); // R12.1
    expect(bounds("pipeWidth")).toEqual([40, 80]); // R12.2
    expect(bounds("cloudCount")).toEqual([1, 10]); // R12.3
    expect(bounds("scoreFontSize")).toEqual([16, 48]); // R12.4
    expect(bounds("cloudOpacityMin")).toEqual([0.3, 0.8]); // R12.6
    expect(bounds("cloudOpacityMax")).toEqual([0.3, 0.8]); // R12.6
    expect(bounds("ghostHitboxRadius")).toEqual([8, 16]); // R19.8
    // Default radius fits within half the default sprite size (R19.8).
    expect(DEFAULT_CONFIG.ghostHitboxRadius).toBeLessThanOrEqual(
      Math.min(DEFAULT_CONFIG.ghostWidth, DEFAULT_CONFIG.ghostHeight) / 2,
    );
  });
});

describe("getConfigValue", () => {
  it("reads top-level and nested dotted paths", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "physics.gravity")).toBe(1600);
    expect(getConfigValue(DEFAULT_CONFIG, "gapHeight")).toBe(160);
  });

  it("returns undefined for missing paths without throwing", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "physics.nope")).toBeUndefined();
    expect(getConfigValue(DEFAULT_CONFIG, "gapHeight.deeper")).toBeUndefined();
    expect(getConfigValue({}, "physics.gravity")).toBeUndefined();
  });
});

describe("validateConfig", () => {
  it("returns [] for the default config (R16.6)", () => {
    expect(validateConfig(DEFAULT_CONFIG, CONFIG_SCHEMA)).toEqual([]);
  });

  it("reports an out-of-range value with key, value and range (R16.1, R16.2)", () => {
    const cfg = withOverrides({ physics: { ...DEFAULT_CONFIG.physics, flapVelocity: -300 } });
    const warnings = validateConfig(cfg, CONFIG_SCHEMA);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toBe("physics.flapVelocity");
    expect(warnings[0].value).toBe(-300);
    expect(warnings[0].message).toContain("-500");
    expect(warnings[0].message).toContain("-400");
  });

  it("reports missing and non-finite values", () => {
    const cfg = withOverrides({ gapHeight: undefined, spawnDistance: NaN, pipeWidth: "60" });
    const keys = validateConfig(cfg, CONFIG_SCHEMA).map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(["gapHeight", "spawnDistance", "pipeWidth"]));
  });

  it("reports maxPipeSpeed < basePipeSpeed naming both (R16.4)", () => {
    const warnings = validateConfig(withOverrides({ basePipeSpeed: 300, maxPipeSpeed: 200 }), CONFIG_SCHEMA);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toContain("maxPipeSpeed");
    expect(warnings[0].key).toContain("basePipeSpeed");
    expect(warnings[0].value).toEqual({ maxPipeSpeed: 200, basePipeSpeed: 300 });
  });

  it("accepts maxPipeSpeed equal to basePipeSpeed", () => {
    expect(validateConfig(withOverrides({ basePipeSpeed: 200, maxPipeSpeed: 200 }), CONFIG_SCHEMA)).toEqual([]);
  });

  it("reports each cloud ratio outside (0, 1) by index (R16.5)", () => {
    const warnings = validateConfig(withOverrides({ cloudLayerSpeedRatios: [0, 0.5, 1] }), CONFIG_SCHEMA);
    expect(warnings.map((w) => w.key)).toEqual(["cloudLayerSpeedRatios[0]", "cloudLayerSpeedRatios[2]"]);
    expect(warnings.map((w) => w.value)).toEqual([0, 1]);
  });

  it("reports fewer than 2 distinct cloud ratios (R12.7)", () => {
    const warnings = validateConfig(withOverrides({ cloudLayerSpeedRatios: [0.3, 0.3] }), CONFIG_SCHEMA);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toBe("cloudLayerSpeedRatios");
  });

  it("reports a hitbox radius above half the sprite size (R19.8)", () => {
    const warnings = validateConfig(withOverrides({ ghostWidth: 24, ghostHeight: 32, ghostHitboxRadius: 14 }), CONFIG_SCHEMA);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toBe("ghostHitboxRadius");
    expect(warnings[0].value).toBe(14);
    expect(warnings[0].message).toContain("12");
  });

  it("never throws for missing or non-object inputs", () => {
    for (const bad of [undefined, null, 42, "x", [], Object.create(null), { physics: null }]) {
      expect(() => validateConfig(bad, CONFIG_SCHEMA)).not.toThrow();
      expect(Array.isArray(validateConfig(bad, CONFIG_SCHEMA))).toBe(true);
      expect(() => validateConfig(DEFAULT_CONFIG, bad)).not.toThrow();
    }
    expect(validateConfig(undefined, CONFIG_SCHEMA).length).toBeGreaterThan(0);
    expect(() => validateConfig(withOverrides({ gapHeight: Symbol("s"), pipeWidth: Object.create(null) }), CONFIG_SCHEMA)).not.toThrow();
  });
});

describe("clampToSchema", () => {
  it("clamps below-min and above-max values (R17.6)", () => {
    expect(clampToSchema("ghostHitboxRadius", 2, CONFIG_SCHEMA)).toBe(8);
    expect(clampToSchema("ghostHitboxRadius", 40, CONFIG_SCHEMA)).toBe(16);
    expect(clampToSchema("physics.flapVelocity", -1000, CONFIG_SCHEMA)).toBe(-500);
  });

  it("leaves in-range values unchanged", () => {
    expect(clampToSchema("gapHeight", 160, CONFIG_SCHEMA)).toBe(160);
    expect(clampToSchema("gapHeight", 100, CONFIG_SCHEMA)).toBe(100);
    expect(clampToSchema("gapHeight", 300, CONFIG_SCHEMA)).toBe(300);
  });
});

describe("resolveConfig", () => {
  it("returns the default config unchanged with no warnings", () => {
    const { config, warnings } = resolveConfig(DEFAULT_CONFIG, CONFIG_SCHEMA);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("keeps a valid non-default radius", () => {
    const { config, warnings } = resolveConfig(withOverrides({ ghostHitboxRadius: 16 }), CONFIG_SCHEMA);
    expect(config.ghostHitboxRadius).toBe(16);
    expect(warnings).toEqual([]);
  });

  const invalidRadii = [
    ["missing", withOverrides({ ghostHitboxRadius: undefined }), undefined],
    ["non-numeric", withOverrides({ ghostHitboxRadius: "12" }), "12"],
    ["NaN", withOverrides({ ghostHitboxRadius: NaN }), NaN],
    ["below 8", withOverrides({ ghostHitboxRadius: 7 }), 7],
    ["above 16", withOverrides({ ghostHitboxRadius: 17 }), 17],
    ["above half the sprite", withOverrides({ ghostWidth: 24, ghostHeight: 32, ghostHitboxRadius: 14 }), 14],
  ];

  for (const [label, input, rejected] of invalidRadii) {
    it(`replaces a ${label} radius with 12 and warns once (R19.10)`, () => {
      const snapshot = structuredClone(input);
      const { config, warnings } = resolveConfig(input, CONFIG_SCHEMA);
      expect(config.ghostHitboxRadius).toBe(12);
      const radiusWarnings = warnings.filter((w) => w.key === "ghostHitboxRadius");
      expect(radiusWarnings).toHaveLength(1);
      expect(radiusWarnings[0].value).toEqual(rejected);
      expect(radiusWarnings[0].message).toContain("replaced with 12");
      // Every other field is unchanged, and the input is not mutated.
      const { ghostHitboxRadius: _a, ...restOut } = config;
      const { ghostHitboxRadius: _b, ...restIn } = input;
      expect(restOut).toEqual(restIn);
      expect(input).toEqual(snapshot);
    });
  }

  it("treats a key that is absent entirely as missing", () => {
    const { ghostHitboxRadius: _omit, ...noRadius } = DEFAULT_CONFIG;
    const { config, warnings } = resolveConfig(noRadius, CONFIG_SCHEMA);
    expect(config.ghostHitboxRadius).toBe(12);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toBe("ghostHitboxRadius");
  });

  it("leaves other invalid values unchanged and still reports them (R16.3)", () => {
    const input = withOverrides({ gapHeight: 999, basePipeSpeed: 300, maxPipeSpeed: 200, ghostHitboxRadius: 40 });
    const { config, warnings } = resolveConfig(input, CONFIG_SCHEMA);
    expect(config.gapHeight).toBe(999);
    expect(config.basePipeSpeed).toBe(300);
    expect(config.maxPipeSpeed).toBe(200);
    expect(config.ghostHitboxRadius).toBe(12);
    const keys = warnings.map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(["gapHeight", "maxPipeSpeed/basePipeSpeed", "ghostHitboxRadius"]));
    expect(keys.filter((k) => k === "ghostHitboxRadius")).toHaveLength(1);
  });

  it("returns warnings identical to validateConfig when the radius is valid", () => {
    const input = withOverrides({ gapHeight: 50, cloudLayerSpeedRatios: [0, 0.5] });
    const { config, warnings } = resolveConfig(input, CONFIG_SCHEMA);
    expect(config).toBe(input);
    expect(warnings).toEqual(validateConfig(input, CONFIG_SCHEMA));
  });

  it("never throws for bad inputs", () => {
    for (const bad of [undefined, null, 42, "x", [], Object.create(null), { physics: null }]) {
      expect(() => resolveConfig(bad, CONFIG_SCHEMA)).not.toThrow();
      const result = resolveConfig(bad, CONFIG_SCHEMA);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.config.ghostHitboxRadius).toBe(12);
      expect(() => resolveConfig(DEFAULT_CONFIG, bad)).not.toThrow();
    }
  });
});

describe("setConfigValue", () => {
  it("returns a new config with a nested value replaced, leaving the input unmutated (R17.5, R17.10)", () => {
    const original = structuredClone(DEFAULT_CONFIG);
    const next = setConfigValue(DEFAULT_CONFIG, "physics.gravity", 2000);
    expect(next).not.toBe(DEFAULT_CONFIG);
    expect(next.physics).not.toBe(DEFAULT_CONFIG.physics);
    expect(next.physics.gravity).toBe(2000);
    expect(next.physics.flapVelocity).toBe(DEFAULT_CONFIG.physics.flapVelocity);
    expect(DEFAULT_CONFIG).toStrictEqual(original);
  });

  it("replaces a top-level value and shares untouched siblings", () => {
    const next = setConfigValue(DEFAULT_CONFIG, "gapHeight", 200);
    expect(next.gapHeight).toBe(200);
    expect(DEFAULT_CONFIG.gapHeight).toBe(160);
    expect(next.physics).toBe(DEFAULT_CONFIG.physics);
    expect(getConfigValue(next, "gapHeight")).toBe(200);
  });

  it("creates missing intermediate objects", () => {
    expect(setConfigValue({}, "a.b", 1)).toStrictEqual({ a: { b: 1 } });
  });
});

describe("serializeConfig", () => {
  const parse = (text) => {
    const prefix = "export const DEFAULT_CONFIG =";
    expect(text.startsWith(prefix)).toBe(true);
    expect(text.endsWith(";")).toBe(true);
    const literal = text.slice(prefix.length, -1);
    return new Function("return (" + literal + ")")();
  };

  it("emits a pasteable export statement that round-trips DEFAULT_CONFIG (R17.7)", () => {
    const text = serializeConfig(DEFAULT_CONFIG);
    expect(text).toMatch(/^export const DEFAULT_CONFIG = \{\n/);
    expect(text).toContain("cloudLayerSpeedRatios: [0.2, 0.4],");
    expect(parse(text)).toStrictEqual(DEFAULT_CONFIG);
  });

  it("round-trips negative numbers, floats and -0", () => {
    const cfg = setConfigValue(
      setConfigValue(DEFAULT_CONFIG, "physics.flapVelocity", -412.5),
      "speedStep",
      -0,
    );
    const back = parse(serializeConfig(cfg));
    expect(back).toStrictEqual(cfg);
    expect(Object.is(back.speedStep, -0)).toBe(true);
    expect(back.physics.flapVelocity).toBe(-412.5);
  });

  it("quotes keys that are not valid identifiers", () => {
    const cfg = { "not-an-id": 1, nested: { "2x": [0.1, 0.9] } };
    expect(parse(serializeConfig(cfg))).toStrictEqual(cfg);
  });
});
