import { describe, expect, it } from "vitest";
import {
  DESIGN_THEME_IDS,
  PRODUCT_LAYOUTS,
  THEME_FONT_FAMILIES,
  isProductLayout,
  normalizeDesignTheme,
} from "@/lib/design-themes";
import { designThemeSchema } from "@/lib/admin.functions";
import { THEME_STAGES } from "@/themes/registry";
import { THEME_THUMBS } from "@/themes/thumbs";
import { crossAt } from "@/themes/time-scanner/stage";
import { orbitSpot } from "@/themes/orbital-portal/stage";
import { MIGRATION_STAGES } from "@/themes/terminal-migration/stage";
import { readiness, reviewedLabel } from "@/components/product-layouts/model";

const HEROES = ["time-scanner", "orbital-portal", "terminal-migration"] as const;

describe("three new homepage designs", () => {
  it.each(HEROES)("%s is registered with a stage, a thumb and its fonts", (id) => {
    expect(DESIGN_THEME_IDS).toContain(id);
    expect(THEME_STAGES[id]).toBeDefined();
    expect(THEME_THUMBS[id]).toBeTypeOf("function");
    expect(THEME_FONT_FAMILIES[id]).toContain("IBM Plex Sans Arabic");
  });
  it("time scanner moves products across the beam in order, inside 20–80%", () => {
    const at = [0, 1, 2, 3, 4, 5].map((i) => crossAt(i, 6));
    expect(at[0]).toBe(20);
    expect(at[5]).toBe(80);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("orbit spots stay inside the orbit box", () => {
    for (let i = 0; i < 8; i++) {
      const s = orbitSpot(i, 8);
      expect(s.x).toBeGreaterThanOrEqual(6);
      expect(s.x).toBeLessThanOrEqual(94);
      expect(s.y).toBeGreaterThanOrEqual(20);
      expect(s.y).toBeLessThanOrEqual(80);
    }
  });
  it("terminal migration has four bilingual stages", () => {
    expect(MIGRATION_STAGES).toHaveLength(4);
    for (const s of MIGRATION_STAGES) expect(s.ar && s.en && s.textAr && s.textEn).toBeTruthy();
  });
});

describe("product page layout setting", () => {
  it("keeps a valid layout and drops unknown ones", () => {
    expect(normalizeDesignTheme({ theme: "classic", productLayout: "mission" }).productLayout).toBe(
      "mission",
    );
    expect(normalizeDesignTheme({ theme: "classic", productLayout: "nope" })).not.toHaveProperty(
      "productLayout",
    );
    expect(PRODUCT_LAYOUTS.every(isProductLayout)).toBe(true);
  });
  it("is accepted by the save schema and optional", () => {
    const base = { theme: "classic", animations: true, intensity: "medium" } as const;
    expect(designThemeSchema.parse({ ...base, productLayout: "journey" }).productLayout).toBe(
      "journey",
    );
    expect(designThemeSchema.parse(base)).not.toHaveProperty("productLayout");
    expect(() => designThemeSchema.parse({ ...base, productLayout: "x" })).toThrow();
  });
  it("readiness is the ticked share and reviewed dates read as words", () => {
    expect(readiness([true, false, false, true])).toBe(50);
    expect(readiness([])).toBe(0);
    expect(reviewedLabel("2026-11-19", "en")).toBe("19 November 2026");
    expect(reviewedLabel("soon", "en")).toBe("soon");
  });
});
