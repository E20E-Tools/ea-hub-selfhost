import { describe, expect, it } from "vitest";
import { fallbackCatalog } from "@/lib/catalog";
import { buildTechnologyRoadmap, proposedPhase, roadmapPeriods } from "@/lib/technology-roadmap";

describe("2026–2027 technology adoption roadmap", () => {
  it("covers all eight quarters in exactly 2026 and 2027", () => {
    expect(roadmapPeriods().map((p) => p.id)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
      "2027-Q1",
      "2027-Q2",
      "2027-Q3",
      "2027-Q4",
    ]);
    expect(roadmapPeriods(2027).map((p) => p.id)).toEqual([
      "2027-Q1",
      "2027-Q2",
      "2027-Q3",
      "2027-Q4",
    ]);
  });
  it("includes every supplied live catalog entry, including newly added technologies", () => {
    const first = fallbackCatalog.products[0];
    if (!first) throw new Error("Fixture requires a product");
    const products = [
      ...fallbackCatalog.products,
      { ...first, id: "new-technology", name: "New technology" },
    ];
    expect(buildTechnologyRoadmap(products).map((row) => row.product.id)).toEqual(
      products.map((p) => p.id),
    );
    expect(buildTechnologyRoadmap(products).every((row) => row.milestones.length === 8)).toBe(true);
  });
  it("does not imply past adoption or a fixed launch date for coming-soon tools", () => {
    expect(proposedPhase({ comingSoon: true }, { id: "2026-Q1", year: 2026, quarter: 1 })).toBe(
      "unrecorded",
    );
    expect(
      buildTechnologyRoadmap(
        fallbackCatalog.products.map((p) => ({ ...p, comingSoon: true })),
        2027,
      ).every((row) =>
        row.milestones.every((m) => m.phase === "plan" || m.phase === "conditional"),
      ),
    ).toBe(true);
  });
});
