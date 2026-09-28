import { describe, it, expect, vi } from "vitest";
import { runStartupValidation } from "../../src/shell/startup.js";
import { DEFAULT_CONFIG, CONFIG_SCHEMA } from "../../src/core/config.js";

describe("runStartupValidation", () => {
  it("logs nothing for DEFAULT_CONFIG and returns it unchanged", () => {
    const warn = vi.fn();
    const { config, warnings } = runStartupValidation(DEFAULT_CONFIG, CONFIG_SCHEMA, warn);
    expect(warn).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    expect(config).toBe(DEFAULT_CONFIG);
  });

  it("logs one warning per problem with key, value and range, without correcting (R16.3)", () => {
    const warn = vi.fn();
    const bad = { ...DEFAULT_CONFIG, pipeWidth: 999, maxPipeSpeed: 100, basePipeSpeed: 200 };
    const { config, warnings } = runStartupValidation(bad, CONFIG_SCHEMA, warn);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warn).toHaveBeenCalledTimes(warnings.length);
    const logged = warn.mock.calls.map((c) => c[0]).join("\n");
    expect(logged).toContain("pipeWidth");
    expect(logged).toContain("999");
    expect(logged).toContain("[40, 80]");
    expect(logged).toContain("maxPipeSpeed (100) must be >= basePipeSpeed (200)");
    expect(config.pipeWidth).toBe(999);
    expect(config.maxPipeSpeed).toBe(100);
  });

  it("replaces an invalid hitbox radius with 12 and warns (R19.10)", () => {
    const warn = vi.fn();
    const { config, warnings } = runStartupValidation(
      { ...DEFAULT_CONFIG, ghostHitboxRadius: 40 }, CONFIG_SCHEMA, warn,
    );
    expect(config.ghostHitboxRadius).toBe(12);
    expect(warnings.some((w) => w.key === "ghostHitboxRadius")).toBe(true);
    expect(warn.mock.calls.some((c) => c[0].includes("ghostHitboxRadius"))).toBe(true);
  });

  it("never throws, even with a throwing logger or garbage input", () => {
    const warn = () => { throw new Error("boom"); };
    expect(() => runStartupValidation({ ...DEFAULT_CONFIG, pipeWidth: NaN }, CONFIG_SCHEMA, warn)).not.toThrow();
    expect(() => runStartupValidation(null, null, warn)).not.toThrow();
    const { warnings } = runStartupValidation(undefined, CONFIG_SCHEMA, warn);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
