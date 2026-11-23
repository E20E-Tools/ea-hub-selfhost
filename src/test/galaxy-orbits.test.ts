import { describe, expect, it } from "vitest";
import {
  SUN_Z,
  behindSun,
  depthIndex,
  formatTDays,
  formatTMinus,
  orbitLayout,
  placeLabel,
  project,
} from "@/themes/e20e-galaxy/orbits";

describe("galaxy orbit layout", () => {
  it("handles 0, 1, 6 and 12 planets", () => {
    expect(orbitLayout(0)).toEqual([]);
    expect(orbitLayout(1)).toHaveLength(1);
    expect(new Set(orbitLayout(6).map((o) => o.ring)).size).toBe(6);
    const twelve = orbitLayout(12);
    expect(twelve).toHaveLength(12);
    expect(new Set(twelve.map((o) => o.ring)).size).toBe(6);
  });
  it("shares rings in pairs half a turn apart", () => {
    const o = orbitLayout(8);
    const ring0 = o.filter((x) => x.ring === 0);
    expect(ring0).toHaveLength(2);
    const diff = Math.abs(ring0[0]!.phase - ring0[1]!.phase);
    expect(Math.min(diff, 2 * Math.PI - diff)).toBeCloseTo(Math.PI, 5);
  });
  it("inner orbits are faster (T ∝ a^1.5) and the outer ring is 1", () => {
    const o = orbitLayout(5);
    for (let i = 1; i < o.length; i++) expect(o[i]!.period).toBeGreaterThan(o[i - 1]!.period);
    expect(o[4]!.a).toBe(1);
    expect(o[4]!.period / o[0]!.period).toBeCloseTo((1 / o[0]!.a) ** 1.5, 5);
  });
  it("is deterministic", () => {
    expect(orbitLayout(7)).toEqual(orbitLayout(7));
  });
});

describe("depth ordering", () => {
  const orbit = { ring: 0, a: 0.5, phase: 0, period: 40 };
  it("far side sits behind the sun, near side in front, and near planets are bigger", () => {
    const far = project(orbit, 30, 0.4); // angle 3π/2 → z = -1
    const near = project(orbit, 10, 0.4); // angle π/2 → z = +1
    expect(far.z).toBeCloseTo(-1);
    expect(near.z).toBeCloseTo(1);
    expect(depthIndex(far.z)).toBeLessThan(SUN_Z);
    expect(depthIndex(near.z)).toBeGreaterThan(SUN_Z);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(behindSun({ x: 0, y: -0.05, z: -1 }, 0.1)).toBe(true);
    expect(behindSun({ x: 0, y: 0.05, z: 1 }, 0.1)).toBe(false);
  });
  it("depth index increases monotonically with z", () => {
    const zs = [-1, -0.5, -0.01, 0, 0.5, 1].map(depthIndex);
    for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeGreaterThanOrEqual(zs[i - 1]!);
  });
});

describe("T-minus", () => {
  it("formats days and clock", () => {
    expect(formatTMinus(((11 * 24 + 4) * 3600 + 22 * 60 + 17) * 1000)).toBe("T-11d 04:22:17");
    expect(formatTMinus(999)).toBe("T-0d 00:00:00");
    expect(formatTMinus(0)).toBeNull();
    expect(formatTMinus(-5)).toBeNull();
  });
  it("short label rounds up days", () => {
    expect(formatTDays(11.2 * 86_400_000)).toBe("T-12d");
    expect(formatTDays(0)).toBeNull();
  });
});

describe("planet label placement", () => {
  it("keeps the label right of the planet in English when it fits", () => {
    expect(placeLabel(400, 30, 200, 1368, false)).toEqual({ x: 430, side: "right" });
  });
  it("flips a label near the right edge to the inner (left) side", () => {
    // ITFM near the right edge of a 1368px stage.
    expect(placeLabel(1180, 30, 220, 1368, false)).toEqual({ x: 930, side: "left" });
  });
  it("mirrors in Arabic: left by default, flips right near the left edge", () => {
    expect(placeLabel(800, 30, 200, 1368, true)).toEqual({ x: 570, side: "left" });
    expect(placeLabel(150, 30, 200, 1368, true)).toEqual({ x: 180, side: "right" });
  });
  it("clamps inside the stage when neither side fits", () => {
    const { x } = placeLabel(195, 30, 360, 390, false);
    expect(x).toBeGreaterThanOrEqual(8);
    expect(x + 360).toBeLessThanOrEqual(390 - 8);
  });
});
