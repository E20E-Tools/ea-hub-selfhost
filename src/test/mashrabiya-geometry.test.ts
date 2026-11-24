import { describe, expect, it } from "vitest";
import {
  KHATAM_RATIO,
  khatam,
  polygon,
  ringComposition,
  gridComposition,
  starPoints,
  tessellationTile,
  tracePath,
  type P,
} from "@/themes/digital-mashrabiya/geometry";

const rotate = ([x, y]: P, a: number): P => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
];
const sameSet = (a: P[], b: P[]) =>
  a.every((p) => b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6));

describe("star geometry", () => {
  it("an 8-point star has 16 vertices on two exact radii", () => {
    const s = khatam(0, 0, 10);
    expect(s).toHaveLength(16);
    s.forEach((p, i) =>
      expect(Math.hypot(...p)).toBeCloseTo(i % 2 ? 10 * KHATAM_RATIO : 10, 9),
    );
    expect(starPoints(0, 0, 5, 2, 6)).toHaveLength(12);
    expect(polygon(0, 0, 3, 8)).toHaveLength(8);
  });
  it("Khatam is two overlaid squares: inner vertices sit where the square edges cross", () => {
    // Edge of the axis-aligned square at x = R·cos45° meets the inner vertex at 22.5°.
    const inner = khatam(0, 0, 1, 0)[1]!;
    expect(inner[0]).toBeCloseTo(Math.cos(Math.PI / 4), 9);
  });
  it("has 8-fold rotational and mirror symmetry", () => {
    const s = khatam(0, 0, 10);
    expect(
      sameSet(
        s.map((p) => rotate(p, Math.PI / 4)),
        s,
      ),
    ).toBe(true);
    expect(
      sameSet(
        s.map(([x, y]) => [-x, y] as P),
        s,
      ),
    ).toBe(true);
  });
  it("tessellation tile is a closed star plus four corner girih lines", () => {
    const d = tessellationTile(100);
    expect((d.match(/Z/g) ?? []).length).toBe(1);
    expect((d.match(/M/g) ?? []).length).toBe(5);
    expect(d.startsWith("M100 50")).toBe(true); // axial tip touches the cell edge
    expect(d).toContain("L0 0");
  });
  it("trace paths are octilinear", () => {
    const pts = tracePath([0, 0], [70, -30]);
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i]![0] - pts[i - 1]![0]);
      const dy = Math.abs(pts[i]![1] - pts[i - 1]![1]);
      expect(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9).toBe(true);
    }
    expect(pts.at(-1)).toEqual([70, -30]);
  });
});

describe("ring placement", () => {
  for (const n of [1, 6, 12]) {
    it(`${n} tiles: equal angles, no overlaps, RTL mirrored`, () => {
      const c = ringComposition(n, false);
      expect(c.tiles).toHaveLength(n);
      for (const ring of [0, 1]) {
        const t = c.tiles.filter((x) => x.ring === ring);
        for (let i = 1; i < t.length; i++) {
          const step = t[i]!.angle - t[i - 1]!.angle;
          expect(step).toBeCloseTo((2 * Math.PI) / t.length, 9);
        }
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = c.tiles[i]!;
          const b = c.tiles[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
            (a.size + b.size) / 2,
          );
        }
      c.tiles.forEach((t) => {
        expect(Math.hypot(t.x - c.cx, t.y - c.cy)).toBeGreaterThan(
          c.medallion + t.size / 2,
        );
        expect(t.x - t.size / 2).toBeGreaterThanOrEqual(0);
        expect(t.y - t.size / 2).toBeGreaterThanOrEqual(0);
        expect(t.y + t.size / 2).toBeLessThanOrEqual(c.h);
      });
      const r = ringComposition(n, true);
      r.tiles.forEach((t, i) => {
        expect(t.x).toBeCloseTo(c.w - c.tiles[i]!.x, 9);
        expect(t.y).toBeCloseTo(c.tiles[i]!.y, 9);
      });
    });
  }
  it("phone grid uses two columns and starts on the right in RTL", () => {
    const g = gridComposition(5, true);
    expect(new Set(g.tiles.map((t) => t.x)).size).toBe(2);
    expect(g.tiles[0]!.x).toBeGreaterThan(g.tiles[1]!.x);
  });
});
