import { describe, expect, it } from "vitest";
import {
  DESIGN_THEMES,
  DESIGN_THEME_IDS,
  normalizeDesignTheme,
} from "@/lib/design-themes";
import { designThemeSchema } from "@/lib/admin.functions";
import { THEME_STAGES, hasStage } from "@/themes/registry";
import { THEME_THUMBS } from "@/themes/thumbs";

const retired = [
  "quantum-nexus",
  "circuit-matrix",
  "holo-grid",
  "neural-flow",
  "digital-twin",
  "quantum-grid",
  "aurora-glass",
  "digital-blueprint",
  "orbital-nexus",
  "neo-spectrum",
];

describe("design themes", () => {
  it("offers Classic plus the experience themes", () => {
    expect(DESIGN_THEMES.map((t) => t.id)).toEqual([
      "classic",
      "circuit-core",
      "e20e-os",
      "transformation-metro",
      "e20e-galaxy",
      "digital-mashrabiya",
      "legacy-to-digital",
      "living-blueprint",
      "ea-metropolis",
      "transformation-board",
      "untangle-chaos",
      "reveal-lens",
      "problem-to-tool",
      "particle-forge",
      "flip-deck",
      "ea-layers",
      "time-scanner",
      "orbital-portal",
      "terminal-migration",
    ]);
  });
  it.each(retired)("falls back to Classic for retired theme %s", (theme) => {
    expect(
      normalizeDesignTheme({ theme, animations: false, intensity: "low" }),
    ).toEqual({
      theme: "classic",
      animations: false,
      intensity: "low",
    });
    expect(() =>
      designThemeSchema.parse({ theme, animations: true, intensity: "low" }),
    ).toThrow();
  });
  it("defaults to Classic with animations on at medium", () => {
    expect(normalizeDesignTheme(null)).toEqual({
      theme: "classic",
      animations: true,
      intensity: "medium",
    });
  });
  it("keeps a saved Circuit Core choice", () => {
    const value = {
      theme: "circuit-core",
      animations: false,
      intensity: "high",
    };
    expect(normalizeDesignTheme(value)).toEqual(value);
    expect(designThemeSchema.parse(value)).toEqual(value);
  });
});

describe("theme registry", () => {
  it("Classic has no stage; every experience theme has a stage and a thumb", () => {
    expect(hasStage("classic")).toBe(false);
    expect(THEME_STAGES.classic).toBeUndefined();
    for (const id of DESIGN_THEME_IDS) {
      expect(THEME_THUMBS[id]).toBeTypeOf("function");
      if (id !== "classic") expect(hasStage(id)).toBe(true);
    }
  });
});
