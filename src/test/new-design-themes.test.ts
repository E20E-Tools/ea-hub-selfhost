import { describe, expect, it } from "vitest";
import { products as fallback } from "@/lib/products";
import {
  DESIGN_THEMES,
  DESIGN_THEME_IDS,
  THEME_FONT_FAMILIES,
  defaultDesignTheme,
} from "@/lib/design-themes";
import { THEME_STAGES } from "@/themes/registry";
import { THEME_THUMBS } from "@/themes/thumbs";
import {
  beneficiaryDetailsSchema,
  normalizeBeneficiaryDetails,
} from "@/lib/beneficiary-metadata";
import * as uc from "@/themes/untangle-chaos/model";
import * as rl from "@/themes/reveal-lens/model";
import * as pt from "@/themes/problem-to-tool/model";
import * as pf from "@/themes/particle-forge/model";
import * as fd from "@/themes/flip-deck/model";
import * as el from "@/themes/ea-layers/model";
import type { Product } from "@/lib/catalog";

const NEW = [
  "untangle-chaos",
  "reveal-lens",
  "problem-to-tool",
  "particle-forge",
  "flip-deck",
  "ea-layers",
] as const;
const p = (over: Partial<Product>): Product =>
  ({
    id: "x",
    name: "X",
    category: "other",
    label: "",
    description: "",
    overview: "",
    features: [],
    url: "",
    keywords: "",
    ...over,
  }) as Product;

describe("six new designs are registered", () => {
  it.each(NEW)(
    "%s has id, bilingual name/description, stage, thumb and fonts",
    (id) => {
      expect(DESIGN_THEME_IDS).toContain(id);
      const meta = DESIGN_THEMES.find((t) => t.id === id)!;
      expect(
        meta.name.ar &&
          meta.name.en &&
          meta.description.ar &&
          meta.description.en,
      ).toBeTruthy();
      expect(THEME_STAGES[id]).toBeDefined();
      expect(THEME_THUMBS[id]).toBeTypeOf("function");
      expect(THEME_FONT_FAMILIES[id]).toContain("Sora");
    },
  );
  it("does not change the default design", () =>
    expect(defaultDesignTheme.theme).toBe("classic"));
});

describe("untangle-chaos", () => {
  it("runs fly → scan (650ms) → morph (1s) → done", () => {
    expect(uc.SCAN_MS).toBe(650);
    expect(uc.MORPH_MS).toBe(1000);
    expect(uc.fixPhase(null).phase).toBe("legacy");
    expect(uc.fixPhase(100).phase).toBe("fly");
    expect(uc.fixPhase(uc.FLY_MS + 10).phase).toBe("scan");
    expect(uc.fixPhase(uc.FLY_MS + 700).phase).toBe("morph");
    expect(uc.fixPhase(uc.FIX_TOTAL_MS).phase).toBe("done");
  });
  it("routes are orthogonal and end at the core; tangles stop short", () => {
    const r = uc.orthoRoute({ x: 0, y: 0 }, { x: 100, y: 50 });
    for (let i = 1; i < r.length; i++)
      expect(r[i]!.x === r[i - 1]!.x || r[i]!.y === r[i - 1]!.y).toBe(true);
    expect(r.at(-1)).toEqual({ x: 100, y: 50 });
    const end = uc.tanglePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 1, 0).at(-1)!;
    expect(end.x).toBeLessThan(90);
  });
  it("background goes beige→white with progress and fix-all picks the next file", () => {
    expect(uc.backgroundMix(0, 6)).toBe(0);
    expect(uc.backgroundMix(6, 6)).toBe(1);
    expect(uc.mixHex("#ECE5D3", "#FFFFFF", 1)).toBe("#ffffff");
    expect(uc.nextUnfixed(new Set([0, 1]), 3)).toBe(2);
    expect(uc.nextUnfixed(new Set([0, 1, 2]), 3)).toBeNull();
  });
  it("auto-starts only on the first animated visit without interaction", () => {
    expect(uc.AUTO_START_MS).toBe(2000);
    expect(uc.shouldAutoStart(false, false, true)).toBe(true);
    expect(uc.shouldAutoStart(true, false, true)).toBe(false);
    expect(uc.shouldAutoStart(false, true, true)).toBe(false);
    expect(uc.shouldAutoStart(false, false, false)).toBe(false);
  });
  it("splits files between both sides", () => {
    const s = uc.fileSlots(6, 1000, 600, false);
    expect(s.filter((q) => q.x < 500)).toHaveLength(3);
  });
});

describe("reveal-lens", () => {
  it("lens is ~90px and expands to cover the whole stage", () => {
    expect(rl.LENS_RADIUS).toBe(90);
    const cover = rl.coverRadius(0, 0, 300, 400);
    expect(cover).toBe(500);
    expect(rl.lensRadius(0, 90, cover)).toBe(90);
    expect(rl.lensRadius(1, 90, cover)).toBe(500);
  });
  it("idle wander stays inside the stage", () => {
    for (let t = 0; t < 60000; t += 997) {
      const q = rl.lissajous(t, 800, 500);
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(800);
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(500);
    }
  });
});

describe("problem-to-tool", () => {
  it("uses the owner's problem, then the id default, then the description", () => {
    const own = p({
      id: "radar",
      description: "d",
      beneficiaryDetails: {
        ...normalizeBeneficiaryDetails({}),
        problem: { ar: "مشكلتي", en: "" },
      },
    });
    expect(pt.problemFor(own, "ar")).toBe("مشكلتي");
    expect(pt.problemFor(own, "en")).toBe("مشكلتي");
    expect(pt.problemFor(p({ id: "radar" }), "en")).toBe(
      pt.DEFAULT_PROBLEMS["radar"]!.en,
    );
    expect(pt.problemFor(p({ id: "new", description: "desc" }), "ar")).toBe(
      "desc",
    );
  });
  it("every bundled product has an Arabic and English default", () => {
    for (const prod of fallback) {
      expect(pt.DEFAULT_PROBLEMS[prod.id]?.ar).toBeTruthy();
      expect(pt.DEFAULT_PROBLEMS[prod.id]?.en).toBeTruthy();
    }
  });
  it("types letter by letter then holds the match (~6s cycle)", () => {
    const text = pt.DEFAULT_PROBLEMS["itfm"]!.ar;
    expect(pt.typingAt(text, pt.TYPE_MS * 3).shown).toBe(
      Array.from(text).slice(0, 3).join(""),
    );
    expect(
      pt.typingAt(text, Array.from(text).length * pt.TYPE_MS + 10).phase,
    ).toBe("match");
    expect(pt.cycleMs(text)).toBeGreaterThan(4500);
    expect(pt.cycleMs(text)).toBeLessThan(7500);
  });
  it("matches typed words locally to the closest tool", () => {
    const list = fallback;
    expect(pt.bestMatch("overlap between systems", list, "en")).toBe(
      "landscape",
    );
    expect(pt.bestMatch("نتبنّى ونوقف التقنيات", list, "ar")).toBe("radar");
    expect(pt.bestMatch("zzqq", list, "en")).toBeNull();
  });
  it("each tool's own problem text brings up that same tool in Arabic and English", () => {
    for (const prod of fallback) {
      for (const lang of ["ar", "en"] as const) {
        expect(
          pt.bestMatch(pt.DEFAULT_PROBLEMS[prod.id]![lang], fallback, lang),
        ).toBe(prod.id);
        expect(pt.cycleMs(pt.DEFAULT_PROBLEMS[prod.id]![lang])).toBeLessThan(
          7500,
        );
      }
    }
  });
  it("saves the optional problem and layer fields and tolerates old rows", () => {
    expect(normalizeBeneficiaryDetails({}).problem).toEqual({ ar: "", en: "" });
    expect(normalizeBeneficiaryDetails({ eaLayer: "bogus" }).eaLayer).toBe("");
    const parsed = beneficiaryDetailsSchema.parse({
      ...normalizeBeneficiaryDetails({}),
      eaLayer: "data",
    });
    expect(parsed.eaLayer).toBe("data");
  });
});

describe("particle-forge", () => {
  it("cycles grid → clusters → title every 2.8s with fewer particles on phones", () => {
    expect(pf.formationAt(0).formation).toBe("grid");
    expect(pf.formationAt(2800).formation).toBe("clusters");
    expect(pf.formationAt(5600).formation).toBe("title");
    expect(pf.formationAt(8400).formation).toBe("grid");
    expect(pf.particleCount(false, 1)).toBe(400);
    expect(pf.particleCount(true, 1)).toBeLessThan(400);
  });
  it("makes one cluster per product and finds the one under a point", () => {
    const c = pf.clusterCentres(5, 1000, 600);
    expect(c).toHaveLength(5);
    expect(pf.clusterAt(c[2]!, c, 40)).toBe(2);
    expect(pf.clusterAt({ x: -500, y: -500 }, c, 40)).toBe(-1);
  });
  it("samples text pixels and pushes particles away from the pointer", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data[(1 * 4 + 1) * 4 + 3] = 255;
    expect(pf.sampleText(data, 4, 4, 3, 1)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(pf.repel({ x: 10, y: 0 }, { x: 0, y: 0 }, 50, 5).x).toBeGreaterThan(
      0,
    );
    expect(pf.repel({ x: 100, y: 0 }, { x: 0, y: 0 }, 50, 5)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("flip-deck", () => {
  it("stacks, fans symmetric, then flips one after another", () => {
    expect(Math.abs(fd.fanPose(0, 3, 0, 900).x)).toBe(0);
    expect(fd.fanPose(0, 3, 1, 900).x).toBe(-fd.fanPose(2, 3, 1, 900).x);
    expect(fd.flipAngle(0, 0)).toBe(0);
    expect(fd.flipAngle(0, fd.deckSettledAt(3))).toBe(180);
    const mid = fd.STACK_MS + fd.FAN_MS + fd.FLIP_MS;
    expect(fd.flipAngle(0, mid)).toBeGreaterThan(fd.flipAngle(2, mid));
    expect(fd.wave(0, 0, 100)).toBe(0);
  });
});

describe("ea-layers", () => {
  it("maps categories to layers with an admin override", () => {
    expect(el.layerFor({ category: "architecture" })).toBe("business");
    expect(el.layerFor({ category: "technology" })).toBe("technology");
    expect(el.layerFor({ category: "platform" })).toBe("applications");
    expect(el.layerFor({ category: "mystery" })).toBe("applications");
    expect(
      el.layerFor({
        category: "technology",
        beneficiaryDetails: {
          ...normalizeBeneficiaryDetails({}),
          eaLayer: "data",
        },
      }),
    ).toBe("data");
  });
  it("explodes and returns over a 6.4s cycle", () => {
    expect(el.CYCLE_MS).toBe(6400);
    expect(el.explodeAt(0)).toBeCloseTo(0);
    expect(el.explodeAt(3200)).toBeCloseTo(1);
    expect(el.explodeAt(6400)).toBeCloseTo(0);
  });
  it("groups every product onto exactly one layer", () => {
    const g = el.groupByLayer(fallback);
    expect(Object.values(g).flat()).toHaveLength(fallback.length);
  });
});
