import { describe, expect, it } from "vitest";
import { CHIP_CODE_MAX, chipCode, circuitLayout } from "@/themes/circuit-core/layout";
import { countdownParts } from "@/themes/launch";

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("circuit core layout", () => {
  for (const mobile of [false, true]) {
    it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
      `places %i chips without overlap (${mobile ? "mobile" : "desktop"})`,
      (n) => {
        const l = circuitLayout(n, mobile);
        expect(l.chips).toHaveLength(n);
        expect(l.traces).toHaveLength(n);
        const boxes = [l.core, ...l.chips];
        boxes.forEach((a, i) => {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(l.w);
          expect(a.y + a.h).toBeLessThanOrEqual(l.h);
          boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false));
        });
      },
    );
  }
  it("desktop puts 6 chips as 2 top, one per side, 2 bottom", () => {
    const l = circuitLayout(6, false);
    expect(l.chips.filter((c) => c.y === 24)).toHaveLength(2);
    expect(l.chips.filter((c) => c.y > l.h / 2)).toHaveLength(2);
  });
});

describe("chip codes", () => {
  const live = [
    { id: "archone", name: "ArchONE" },
    { id: "landscape", name: "APM & App Landscape" },
    { id: "radar", name: "Tech Radar" },
    { id: "platform", name: "EA Tool" },
    { id: "innovation", name: "Innovation" },
    { id: "itfm", name: "ITFM" },
  ];
  it("derives short clean codes for the six live products", () => {
    expect(live.map(chipCode)).toEqual(["ARCHONE", "APM", "RADAR", "EA-TOOL", "INNOV", "ITFM"]);
  });
  it("never exceeds the chip code length, even for long new products", () => {
    const extra = [
      { id: "enterprise-data-catalogue", name: "Enterprise Data Catalogue" },
      { id: "x".repeat(30), name: "" },
    ];
    for (const p of [...live, ...extra])
      expect(chipCode(p).length).toBeLessThanOrEqual(CHIP_CODE_MAX);
    expect(chipCode(extra[0]!)).toBe("EDC");
  });
});

describe("launch countdown", () => {
  it("reports whole days and hours, then null after launch", () => {
    const target = new Date("2026-11-22T06:00:00Z");
    expect(countdownParts(target, new Date("2026-11-10T03:30:00Z"))).toEqual({
      days: 12,
      hours: 2,
    });
    expect(countdownParts(target, new Date("2026-11-22T06:00:01Z"))).toBeNull();
  });
});
