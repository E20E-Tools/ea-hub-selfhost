import { describe, expect, it } from "vitest";
import {
  generateFloorPlan,
  onRectEdge,
  overlaps,
  revisionCloud,
} from "@/themes/living-blueprint/plan";

const feats = (n: number) => Array.from({ length: n }, (_, i) => (i * 3) % 6);

describe("floor-plan generator", () => {
  for (const n of [1, 6, 12]) {
    for (const vertical of [false, true]) {
      for (const rtl of [false, true]) {
        const label = `${n} products, ${vertical ? "mobile" : "desktop"}${rtl ? ", RTL" : ""}`;
        const plan = generateFloorPlan(feats(n), { vertical, rtl });
        it(`${label}: one room per product inside the building`, () => {
          expect(plan.rooms).toHaveLength(n);
          expect(plan.rooms.map((r) => r.index).sort((a, b) => a - b)).toEqual([
            ...Array(n).keys(),
          ]);
          for (const r of plan.rooms) {
            expect(r.x).toBeGreaterThanOrEqual(plan.outer.x - 0.5);
            expect(r.y).toBeGreaterThanOrEqual(plan.outer.y - 0.5);
            expect(r.x + r.w).toBeLessThanOrEqual(plan.outer.x + plan.outer.w + 0.5);
            expect(r.y + r.h).toBeLessThanOrEqual(plan.outer.y + plan.outer.h + 0.5);
          }
        });
        it(`${label}: no overlapping rooms, none over the atrium`, () => {
          plan.rooms.forEach((a, i) => {
            expect(overlaps(a, plan.atrium)).toBe(false);
            plan.rooms.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false));
          });
        });
        it(`${label}: every room connects to the atrium by an orthogonal corridor`, () => {
          for (const r of plan.rooms) {
            const c = r.corridor;
            expect(c[0]).toEqual([r.door.x, r.door.y]);
            expect(onRectEdge(c[0]!, r)).toBe(true);
            expect(onRectEdge(c[c.length - 1]!, plan.atrium)).toBe(true);
            for (let i = 1; i < c.length; i++) {
              const [ax, ay] = c[i - 1]!;
              const [bx, by] = c[i]!;
              expect(ax === bx || ay === by).toBe(true);
            }
          }
        });
      }
    }
  }
  it("is deterministic and mirrors for RTL", () => {
    const a = generateFloorPlan(feats(6), { vertical: false });
    expect(generateFloorPlan(feats(6), { vertical: false })).toEqual(a);
    const m = generateFloorPlan(feats(6), { vertical: false, rtl: true });
    expect(m.rooms[0]!.x).toBeCloseTo(a.width - a.rooms[0]!.x - a.rooms[0]!.w, 0);
  });
  it("draws a closed revision cloud", () => {
    const d = revisionCloud({ x: 0, y: 0, w: 100, h: 60 });
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});
