import { describe, expect, it } from "vitest";
import {
  cubicPath,
  hubLink,
  hubU,
  l2dLayout,
  LEGACY_DESKTOP_FILES,
  legacyFileName,
  legacyKind,
  lerpPoints,
  morphAt,
  sliderKey,
} from "@/themes/legacy-to-digital/model";

describe("legacy filenames", () => {
  it("uses the owner table", () => {
    expect(legacyFileName({ id: "archone", name: "ArchONE" })).toBe(
      "EA_diagrams_2017.vsd",
    );
    expect(legacyFileName({ id: "itfm", name: "ITFM" })).toBe(
      "IT_budget_2019_copy(2).xls",
    );
    expect(legacyFileName({ id: "platform", name: "EA Tool" })).toBe(
      "\\\\shared-drive\\EA\\misc\\",
    );
  });
  it("falls back to <Name>_FINAL_v2.xlsx", () => {
    expect(legacyFileName({ id: "new-one", name: "Data Hub" })).toBe(
      "Data_Hub_FINAL_v2.xlsx",
    );
    expect(legacyFileName({ id: "x", name: "  " })).toBe(
      "Untitled_FINAL_v2.xlsx",
    );
  });
});

describe("transformation slider keys", () => {
  it("LTR: left reveals more digital, right less; Home/End bounds", () => {
    expect(sliderKey(60, "ArrowLeft", { rtl: false, vertical: false })).toBe(
      65,
    );
    expect(sliderKey(60, "ArrowRight", { rtl: false, vertical: false })).toBe(
      55,
    );
    expect(sliderKey(60, "Home", { rtl: false, vertical: false })).toBe(0);
    expect(sliderKey(60, "End", { rtl: false, vertical: false })).toBe(100);
  });
  it("RTL mirrors the arrows", () => {
    expect(sliderKey(60, "ArrowRight", { rtl: true, vertical: false })).toBe(
      65,
    );
    expect(sliderKey(60, "ArrowLeft", { rtl: true, vertical: false })).toBe(55);
  });
  it("vertical: up reveals more digital; clamps; ignores other keys", () => {
    expect(sliderKey(98, "ArrowUp", { rtl: false, vertical: true })).toBe(100);
    expect(sliderKey(3, "ArrowDown", { rtl: true, vertical: true })).toBe(0);
    expect(sliderKey(50, "PageUp", { rtl: false, vertical: false })).toBe(70);
    expect(sliderKey(50, "a", { rtl: false, vertical: false })).toBeNull();
  });
});

describe("path interpolation", () => {
  const a: [number, number][] = [
    [0, 0],
    [10, 40],
    [30, -20],
    [40, 0],
  ];
  const b: [number, number][] = [
    [0, 0],
    [0, 0],
    [40, 0],
    [40, 0],
  ];
  it("returns the endpoints at 0 and 1 and the midpoint at 0.5", () => {
    expect(lerpPoints(a, b, 0)).toEqual(a);
    expect(lerpPoints(a, b, 1)).toEqual(b);
    expect(lerpPoints(a, b, 0.5)[1]).toEqual([5, 20]);
    expect(lerpPoints(a, b, 7)).toEqual(b);
  });
  it("rejects mismatched lists and builds cubic paths", () => {
    expect(() => lerpPoints(a, b.slice(1), 0.5)).toThrow();
    expect(cubicPath(a)).toBe("M0 0C10 40 30 -20 40 0");
  });
  it("morph band follows the handle", () => {
    expect(morphAt(0.2, 0.5)).toBe(0);
    expect(morphAt(0.8, 0.5)).toBe(1);
    expect(morphAt(0.5, 0.5)).toBe(0.5);
  });
});

describe("layout", () => {
  it("places 1–12 items inside the stage, deterministic", () => {
    for (const n of [1, 6, 12]) {
      for (const v of [false, true]) {
        const l = l2dLayout(n, v);
        expect(l).toHaveLength(n);
        l.forEach((it) => {
          expect(it.u).toBeGreaterThan(0);
          expect(it.u).toBeLessThan(1);
        });
        expect(l2dLayout(n, v)).toEqual(l);
      }
    }
  });
});

describe("legacy desktop icons", () => {
  it("lists five unique joke filenames, each with a file extension", () => {
    expect(LEGACY_DESKTOP_FILES).toHaveLength(5);
    expect(new Set(LEGACY_DESKTOP_FILES).size).toBe(5);
    for (const name of LEGACY_DESKTOP_FILES)
      expect(name).toMatch(/\.[a-z]{3,4}$/);
  });
  it("gives presentation and image files a diagram icon", () => {
    expect(legacyKind("Copy of Strategy (3).ppt")).toBe("diagram");
    expect(legacyKind("Org_chart_1998.bmp")).toBe("diagram");
    expect(legacyKind("README_old.txt")).toBe("doc");
  });
});

describe("digital links into the E20E hub", () => {
  const hub = { x: 600, y: 400, halfW: 100, halfH: 70 };
  it("runs a card in line with the hub straight into its top or bottom edge", () => {
    expect(hubLink([600, 200], hub, false)[3]).toEqual([600, 330]);
    expect(hubLink([600, 600], hub, false)[3]).toEqual([600, 470]);
  });
  it("bends side cards onto the backbone into the hub's facing side", () => {
    expect(hubLink([150, 200], hub, false)[3]).toEqual([500, 400]);
    expect(hubLink([1050, 600], hub, false)[3]).toEqual([700, 400]);
  });
  it("on phones, joins the vertical backbone into the hub's top or bottom", () => {
    expect(hubLink([100, 150], hub, true)[3]).toEqual([600, 330]);
    expect(hubLink([1000, 700], hub, true)[3]).toEqual([600, 470]);
    expect(hubLink([100, 420], hub, true)[3]).toEqual([500, 420]);
  });
});

describe("phone layout keeps cards off the hub", () => {
  it("never puts a row level with the centred hub", () => {
    for (const n of [2, 6, 12]) {
      l2dLayout(n, true).forEach((it) => {
        expect(Math.abs(it.u - hubU(true))).toBeGreaterThanOrEqual(0.14);
        expect(it.u).toBeLessThanOrEqual(0.92);
      });
    }
  });
});
