import { describe, expect, it } from "vitest";
import {
  DESIGN_THEME_IDS,
  normalizeDesignTheme,
  themeMeta,
} from "@/lib/design-themes";
import { THEME_STAGES, hasStage } from "@/themes/registry";
import { THEME_THUMBS } from "@/themes/thumbs";
import { circuitLayout } from "@/themes/circuit-core/layout";
import {
  boardTelemetry,
  cableAt,
  cableJoints,
  elasticSettle,
  polylineToCubic,
  restPosition,
  settlePosition,
  sliderKey,
  spaghetti,
  subdivide,
  TB_REST,
  tbBoard,
  transformPercent,
} from "@/themes/transformation-board/model";
describe("transformation board registry", () => {
  it("is the ninth experience theme with a stage, a thumbnail and bilingual names", () => {
    expect(
      DESIGN_THEME_IDS.filter((id) => id !== "classic").indexOf(
        "transformation-board",
      ),
    ).toBe(8);
    expect(DESIGN_THEME_IDS).toContain("transformation-board");
    expect(hasStage("transformation-board")).toBe(true);
    expect(THEME_STAGES["transformation-board"]).toBeDefined();
    expect(THEME_THUMBS["transformation-board"]).toBeTypeOf("function");
    const meta = themeMeta("transformation-board");
    expect(meta.name).toEqual({
      en: "Transformation Board",
      ar: "لوحة التحول",
    });
    expect(meta.description.en.length).toBeGreaterThan(10);
    expect(meta.description.ar.length).toBeGreaterThan(10);
    expect(normalizeDesignTheme({ theme: "transformation-board" }).theme).toBe(
      "transformation-board",
    );
  });
  it("keeps the two source themes registered", () => {
    expect(hasStage("legacy-to-digital")).toBe(true);
    expect(hasStage("circuit-core")).toBe(true);
  });
});

describe("cable interpolation", () => {
  for (const mobile of [false, true]) {
    const board = tbBoard(6, mobile);
    const layout = circuitLayout(6, mobile);
    it(`uses Circuit Core's board unchanged (${mobile ? "phone" : "desktop"})`, () => {
      expect(board.chips).toEqual(layout.chips);
      expect(board.core).toEqual(layout.core);
      expect(board.cables).toHaveLength(6);
    });
    it(`morph 1 is exactly the chamfered trace from chip to core (${mobile ? "phone" : "desktop"})`, () => {
      board.cables.forEach((cable, i) => {
        const trace = layout.traces[i]!.pts;
        const at1 = cableAt(cable, 1);
        expect(at1).toEqual(cable.trace);
        // Chip end first, core end last.
        expect(at1[0]).toEqual(trace[trace.length - 1]);
        expect(at1[at1.length - 1]).toEqual(trace[0]);
        // Every trace corner is an on-curve point of the cubic chain, in order.
        const joints = at1
          .filter((_, k) => k % 3 === 0)
          .map((p) => p.join(","));
        let from = 0;
        for (const corner of [...trace].reverse()) {
          const at = joints.indexOf(corner.join(","), from);
          expect(at).toBeGreaterThanOrEqual(from);
          from = at;
        }
      });
    });
    it(`morph 0 is spaghetti that starts at the chip and stops short of the core (${mobile ? "phone" : "desktop"})`, () => {
      board.cables.forEach((cable) => {
        const at0 = cableAt(cable, 0);
        expect(at0).toEqual(cable.mess);
        expect(at0).toHaveLength(cable.trace.length);
        expect(at0[0]).toEqual(cable.trace[0]);
        expect(at0[at0.length - 1]).not.toEqual(
          cable.trace[cable.trace.length - 1],
        );
        for (const [x, y] of at0) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(board.w);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(board.h);
        }
      });
    });
  }
  it("keeps the chip end fixed while the shape morphs halfway", () => {
    const cable = tbBoard(6, false).cables[2]!;
    const mid = cableAt(cable, 0.5);
    expect(mid[0]).toEqual(cable.trace[0]);
    expect(mid[1]![0]).toBeCloseTo(
      (cable.mess[1]![0] + cable.trace[1]![0]) / 2,
    );
  });
  it("converts polylines to 1 + 3k cubic points and is deterministic", () => {
    expect(
      polylineToCubic([
        [0, 0],
        [30, 0],
        [30, 30],
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [30, 10],
      [30, 20],
      [30, 30],
    ]);
    const t = polylineToCubic([
      [0, 0],
      [90, 0],
      [90, 90],
    ]);
    expect(spaghetti(t, 3, { w: 200, h: 200 }, 40)).toEqual(
      spaghetti(t, 3, { w: 200, h: 200 }, 40),
    );
    expect(cableJoints(t)).toEqual([[90, 0]]);
    const parts = subdivide(
      [
        [0, 0],
        [100, 0],
      ],
      40,
    );
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual([0, 0]);
    expect(parts[3]).toEqual([100, 0]);
    expect(parts[1]![0]).toBeCloseTo(100 / 3);
  });
});

describe("transformation handle", () => {
  it("rests at 58% digital", () => {
    expect(transformPercent(TB_REST)).toBe(58);
    expect(transformPercent(0)).toBe(100);
    expect(transformPercent(1)).toBe(0);
  });
  it("arrow keys follow reading direction; Home/End jump to the ends", () => {
    expect(sliderKey(58, "ArrowLeft", { rtl: false, vertical: false })).toBe(
      63,
    );
    expect(sliderKey(58, "ArrowRight", { rtl: false, vertical: false })).toBe(
      53,
    );
    expect(sliderKey(58, "ArrowRight", { rtl: true, vertical: false })).toBe(
      63,
    );
    expect(sliderKey(58, "ArrowLeft", { rtl: true, vertical: false })).toBe(53);
    expect(sliderKey(58, "ArrowUp", { rtl: false, vertical: true })).toBe(63);
    expect(sliderKey(58, "ArrowDown", { rtl: true, vertical: true })).toBe(53);
    expect(sliderKey(58, "Home", { rtl: false, vertical: false })).toBe(0);
    expect(sliderKey(58, "End", { rtl: true, vertical: true })).toBe(100);
    expect(sliderKey(58, "Enter", { rtl: false, vertical: false })).toBeNull();
  });
});

describe("resting handle", () => {
  it("stays at the preferred spot when every item is clear of it", () => {
    expect(restPosition([0.1, 0.6, 0.9], 0.42, 0.05)).toBe(0.42);
  });
  it("moves to the nearest spot where no product is mid-morph", () => {
    const rest = restPosition([0.108, 0.377, 0.5, 0.62, 0.89], 0.42, 0.052);
    expect(transformPercent(rest)).toBeGreaterThanOrEqual(55);
    expect(transformPercent(rest)).toBeLessThanOrEqual(62);
    for (const u of [0.108, 0.377, 0.5, 0.62, 0.89])
      expect(Math.abs(u - rest)).toBeGreaterThanOrEqual(0.052);
  });
});

describe("live board measurements", () => {
  it("counts newly added available tools across the full catalog, beyond twelve board chips", () => {
    const products = Array.from({ length: 13 }, (_, i) => ({
      id: `tool-${i}`,
      name: `Tool ${i}`,
      comingSoon: false,
    }));
    expect(boardTelemetry(products).available).toBe(13);
    expect(
      boardTelemetry([
        ...products,
        { id: "new", name: "New", comingSoon: false },
      ]).available,
    ).toBe(14);
  });
  it("increases the available count when a coming-soon tool becomes available", () => {
    const products = [
      { id: "live", name: "Live", comingSoon: false },
      { id: "next", name: "Next", comingSoon: true },
    ];
    expect(boardTelemetry(products).available).toBe(1);
    expect(
      boardTelemetry(products.map((p) => ({ ...p, comingSoon: false })))
        .available,
    ).toBe(2);
  });
  it("shows zero available tools for an empty catalog or only coming-soon tools", () => {
    expect(boardTelemetry([]).available).toBe(0);
    expect(
      boardTelemetry([{ id: "next", name: "Next", comingSoon: true }])
        .available,
    ).toBe(0);
  });
  const FIXTURE = [
    { id: "radar", name: "Tech Radar", comingSoon: false },
    {
      id: "archone",
      name: "ArchONE",
      comingSoon: true,
      publicationDate: "2026-11-22",
    },
    {
      id: "apm",
      name: "APM & App Landscape",
      comingSoon: true,
      publicationDate: "2026-09-05",
    },
  ];
  it("counts what is live and what is still being built, and names the next launch", () => {
    expect(boardTelemetry(FIXTURE)).toEqual({
      available: 1,
      soon: 2,
      nextLaunch: {
        id: "apm",
        name: "APM & App Landscape",
        date: "2026-09-05",
      },
    });
  });
  it("has no launch date when nothing is coming soon", () => {
    expect(boardTelemetry([{ id: "radar", name: "Tech Radar" }])).toEqual({
      available: 1,
      soon: 0,
      nextLaunch: null,
    });
  });
  it("ignores a coming-soon tool whose date is not a plain calendar date", () => {
    expect(
      boardTelemetry([
        { id: "x", name: "X", comingSoon: true, publicationDate: "Nov 2026" },
      ]).nextLaunch,
    ).toBeNull();
  });
});

describe("elastic settle", () => {
  it("starts at 0, ends at 1 and runs past the target on the way", () => {
    expect(elasticSettle(0)).toBeCloseTo(0);
    expect(elasticSettle(1)).toBeCloseTo(1);
    const peak = Math.max(
      ...Array.from({ length: 101 }, (_, i) => elasticSettle(i / 100)),
    );
    expect(peak).toBeGreaterThan(1.02);
  });
  it("settles on the nearest spot where no product is mid-morph", () => {
    expect(settlePosition([0.1, 0.6, 0.9], 0.42, 0.05)).toBe(0.42);
    const moved = settlePosition([0.1, 0.6, 0.9], 0.6, 0.05);
    expect(Math.abs(moved - 0.6)).toBeGreaterThanOrEqual(0.05);
    expect(moved).toBeGreaterThanOrEqual(0.02);
    expect(moved).toBeLessThanOrEqual(0.98);
  });
});

import {
  activeStop,
  boardCentres,
  journeyStops,
  onlineCount,
  spreadLabels,
  stopPassed,
} from "@/themes/transformation-board/model";
import { morphAt as tbMorphAt } from "@/themes/legacy-to-digital/model";

const CLEAR = 0.052;
function centres(n: number, mobile: boolean, rtl = false) {
  const b = tbBoard(n, mobile);
  const width = mobile ? 360 : 1000;
  const top = mobile ? 40 : 44;
  const bottom = mobile ? 48 : 78;
  return boardCentres(b, n, {
    vertical: mobile,
    rtl,
    width,
    height: top + bottom + (b.h * width) / b.w,
    top,
  });
}

describe("journey stops", () => {
  const cases: Array<[number, boolean, number]> = [
    [2, false, 3], // both chips share the core's column, so "first tools, core still legacy" cannot exist
    [4, false, 4],
    [6, false, 4],
    [12, false, 4],
    [2, true, 4],
    [4, true, 4],
    [6, true, 4],
    [12, true, 3], // the core is the topmost item, so "core connected" merges into the last stop
  ];
  for (const [n, mobile, expected] of cases) {
    it(`${n} products ${mobile ? "phone" : "desktop"}: ordered, distinct, meaningful stops`, () => {
      const us = centres(n, mobile);
      const stops = journeyStops(us, CLEAR);
      expect(stops).toHaveLength(expected);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i]!.id).toBeGreaterThan(stops[i - 1]!.id);
        expect(stops[i - 1]!.h - stops[i]!.h).toBeGreaterThanOrEqual(0.02);
      }
      const core = us[0]!;
      const chips = us.slice(1);
      for (const s of stops) {
        // Nothing caught mid-morph (dense phones fall back to the most open gap).
        const minGap = Math.min(...us.map((u) => Math.abs(u - s.h)));
        expect(minGap).toBeGreaterThanOrEqual(
          n >= 12 && mobile ? 0.03 : CLEAR - 1e-9,
        );
        if (s.id === 2) {
          expect(s.h).toBeGreaterThan(core);
          expect(chips.some((u) => u > s.h)).toBe(true);
        }
        if (s.id === 3) expect(s.h).toBeLessThan(core);
      }
      expect(stops[0]!.id).toBe(1);
      expect(stops[stops.length - 1]!.id).toBe(4);
      expect(stops[0]!.h).toBeGreaterThan(0.9);
      expect(stops[stops.length - 1]!.h).toBeLessThan(0.1);
    });
  }
  it("one product still gives a usable journey without duplicates", () => {
    for (const mobile of [false, true]) {
      const stops = journeyStops(centres(1, mobile), CLEAR);
      expect(stops.length).toBeGreaterThanOrEqual(2);
      expect(new Set(stops.map((s) => s.h)).size).toBe(stops.length);
    }
    expect(journeyStops([], CLEAR)).toEqual([]);
  });
  it("RTL centres mirror the LTR ones, so stops stay in reading-start terms", () => {
    const ltr = centres(6, false);
    const rtl = centres(6, false, true);
    rtl.forEach((u, i) => expect(u).toBeCloseTo(1 - ltr[i]!, 9));
  });
  it("active, passed and online helpers", () => {
    const stops = [
      { id: 1 as const, h: 0.96 },
      { id: 3 as const, h: 0.445 },
      { id: 4 as const, h: 0.04 },
    ];
    expect(activeStop(stops, 0.5)).toBe(1);
    expect(stopPassed(stops[0]!, 0.5)).toBe(true);
    expect(stopPassed(stops[1]!, 0.5)).toBe(false);
    expect(onlineCount([0.1, 0.6, 0.9], 0.5, 0.04)).toBe(2);
    expect(onlineCount([0.1, 0.6, 0.9], 0.5, 0.04)).toBe(
      [0.1, 0.6, 0.9].filter((u) => tbMorphAt(u, 0.5, 0.04) > 0.5).length,
    );
  });
  it("spreads labels so they never overlap and stay inside the board", () => {
    const pos = spreadLabels([10, 300, 320, 990], [150, 150, 120, 170], 1000)!;
    const box = pos.map((x, i) => [
      x - [150, 150, 120, 170][i]! / 2,
      x + [150, 150, 120, 170][i]! / 2,
    ]);
    expect(box[0]![0]).toBeGreaterThanOrEqual(0);
    expect(box[3]![1]).toBeLessThanOrEqual(1000);
    for (let i = 1; i < 4; i++)
      expect(box[i]![0]).toBeGreaterThanOrEqual(box[i - 1]![1]!);
    expect(spreadLabels([0, 1], [400, 400], 600)).toBeNull();
  });
});
