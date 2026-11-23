import { describe, expect, it } from "vitest";
import { layoutBoxes, metroLayout, type MetroInput } from "@/themes/transformation-metro/layout";
import { splitFlapUnits } from "@/themes/transformation-metro/flap";
import { metroLines } from "@/themes/transformation-metro/lines";

function input(products: number, categories: number, long = false): MetroInput {
  const lines: MetroInput = Array.from({ length: categories }, (_, c) => ({
    category: `cat${c}`,
    stations: [],
  }));
  for (let i = 0; i < products; i++) {
    lines[i % categories]?.stations.push({
      id: `p${i}`,
      name: long ? `Enterprise Product Number ${i}` : `Tool ${i}`,
      soon: i % 3 === 2,
    });
  }
  return lines;
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function assertClean(l: ReturnType<typeof metroLayout>) {
  const boxes = layoutBoxes(l);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(l.w);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y + a.h).toBeLessThanOrEqual(l.h);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (overlaps(a, b)) throw new Error(`${a.kind} overlaps ${b.kind}`);
    }
  }
}

describe("metro network layout", () => {
  const cases: Array<[number, number]> = [
    [1, 1],
    [6, 4],
    [6, 1],
    [12, 8],
    [12, 1],
    [12, 3],
  ];
  for (const mobile of [false, true]) {
    for (const long of [false, true]) {
      it.each(cases)(
        `%i products / %i lines has no overlaps (${mobile ? "mobile" : "desktop"}${long ? ", long names" : ""})`,
        (n, c) => {
          const l = metroLayout(input(n, c, long), mobile);
          expect(l.lines.flatMap((x) => x.branches.flatMap((b) => b.stations))).toHaveLength(n);
          assertClean(l);
        },
      );
    }
  }
  it("is deterministic", () => {
    expect(metroLayout(input(6, 4), false)).toEqual(metroLayout(input(6, 4), false));
  });
  it("only octilinear segments", () => {
    for (const line of metroLayout(input(12, 8), false).lines)
      for (const b of line.branches)
        for (let i = 1; i < b.points.length; i++) {
          const [ax, ay] = b.points[i - 1]!;
          const [bx, by] = b.points[i]!;
          const dx = Math.abs(bx - ax);
          const dy = Math.abs(by - ay);
          expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 0.01).toBe(true);
        }
  });
  it("trains stop at the last in-service station", () => {
    const l = metroLayout(
      [
        {
          category: "a",
          stations: [
            { id: "x", name: "X", soon: false },
            { id: "y", name: "Y", soon: true },
          ],
        },
      ],
      false,
    );
    const b = l.lines[0]!.branches[0]!;
    expect(b.serviceLength).toBe(b.stations[0]!.at);
  });
});

describe("split-flap units", () => {
  it("Latin flips per character", () => {
    expect(splitFlapUnits("ITFM 2")).toEqual(["I", "T", "F", "M", " ", "2"]);
  });
  it("Arabic flips whole words", () => {
    expect(splitFlapUnits("في الخدمة")).toEqual(["في", " ", "الخدمة"]);
  });
});

describe("metro lines", () => {
  it("one stable line per category with distinct badges", () => {
    const lines = metroLines([
      { category: "technology" },
      { category: "tech" },
      { category: "architecture" },
      { category: "technology" },
    ]);
    expect(lines.map((l) => l.badge)).toEqual(["T", "2", "A"]);
    expect(new Set(lines.map((l) => l.color)).size).toBe(3);
  });
});
