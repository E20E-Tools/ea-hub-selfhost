import { describe, expect, it } from "vitest";
import {
  HQ,
  buildingFor,
  footprintsOverlap,
  layoutCity,
  nightAt,
  skyAt,
} from "@/themes/ea-metropolis/city";

describe("isometric placement", () => {
  for (const n of [1, 6, 12]) {
    const lots = layoutCity(n);
    const fps = lots.map(
      (l, i) => buildingFor(`p${i}`, i % 7, [l.cx, l.cy]).footprint,
    );
    it(`${n} products: one lot each, no overlapping footprints, clear of HQ`, () => {
      expect(lots).toHaveLength(n);
      fps.forEach((a, i) => {
        expect(footprintsOverlap(a, HQ)).toBe(false);
        fps
          .slice(i + 1)
          .forEach((b) => expect(footprintsOverlap(a, b)).toBe(false));
        // building stays inside its own 2×2 lot
        const lot = lots[i]!.footprint;
        expect(a.x).toBeGreaterThanOrEqual(lot.x);
        expect(a.x + a.w).toBeLessThanOrEqual(lot.x + lot.w);
      });
    });
    it(`${n} products: every road route is orthogonal and reaches the HQ ring road`, () => {
      for (const l of lots) {
        const r = l.route;
        for (let i = 1; i < r.length; i++)
          expect(r[i - 1]![0] === r[i]![0] || r[i - 1]![1] === r[i]![1]).toBe(
            true,
          );
        const [ex, ey] = r[r.length - 1]!;
        expect(Math.abs(ex) === 1.5 || Math.abs(ey) === 1.5).toBe(true);
        expect(Math.abs(ex)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(ey)).toBeLessThanOrEqual(1.5);
      }
    });
  }
  it("caps at 12 lots", () => expect(layoutCity(20)).toHaveLength(12));
});

describe("building generator", () => {
  it("is deterministic per product id", () => {
    expect(buildingFor("archone", 5, [3, 3])).toEqual(
      buildingFor("archone", 5, [3, 3]),
    );
  });
  it("varies silhouettes across ids and grows with features", () => {
    const kinds = new Set(
      [
        "landscape",
        "radar",
        "archone",
        "itfm",
        "innovation",
        "platform",
        "a",
        "b",
        "c",
        "d",
      ].map((id) => buildingFor(id, 3, [0, 3]).kind),
    );
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(buildingFor("radar", 6, [3, 0]).height).toBeGreaterThan(
      buildingFor("radar", 1, [3, 0]).height,
    );
  });
});

describe("day-night cycle", () => {
  it("hits the brief's palette and night levels", () => {
    expect(skyAt(0).top).toBe("#f6c177");
    expect(skyAt(0.25).top).toBe("#8ec5ff");
    expect(skyAt(0.5).top).toBe("#6d5bd0");
    expect(skyAt(0.8).top).toBe("#0e1530");
    expect(nightAt(0.25)).toBe(0);
    expect(nightAt(0.8)).toBe(1);
  });
});
