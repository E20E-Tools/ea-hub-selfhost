/** Pure octilinear metro layout. Coordinates are in a fixed viewBox; labels are pre-truncated so they never overlap. */
export type Pt = [number, number];
export type LayoutStation = {
  productId: string;
  x: number;
  y: number;
  /** Distance along the branch polyline from Central. */
  at: number;
  label: string;
  full: string;
  lx: number;
  ly: number;
  anchor: "start" | "middle" | "end";
  soon: boolean;
};
export type LayoutBranch = {
  points: Pt[];
  /** Polyline length up to the last in-service station (trains run here). */
  serviceLength: number;
  length: number;
  stations: LayoutStation[];
};
export type LayoutLine = { category: string; branches: LayoutBranch[] };
export type MetroLayout = {
  w: number;
  h: number;
  central: { x: number; y: number; w: number; h: number };
  lines: LayoutLine[];
  /** Mobile only: header rows per line. */
  headers?: Array<{ category: string; x: number; y: number }>;
};
export type MetroInput = Array<{
  category: string;
  stations: Array<{ id: string; name: string; soon: boolean }>;
}>;

export const LABEL_FONT = 13;
/** Approximate rendered width of a bold 13px label. */
export function labelWidth(text: string): number {
  let w = 0;
  for (const ch of text)
    w += /[A-Z0-9&]/.test(ch) ? 9.2 : /\s/.test(ch) ? 4 : 8;
  return Math.ceil(w);
}
export function fitLabel(text: string, max: number): string {
  if (labelWidth(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && labelWidth(`${chars.join("")}…`) > max)
    chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

function polyLength(points: Pt[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
}

export function pointAt(
  points: Pt[],
  dist: number,
): { x: number; y: number; angle: number } {
  let left = Math.max(0, dist);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (left <= seg || i === points.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 0;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        y: a[1] + (b[1] - a[1]) * t,
        angle,
      };
    }
    left -= seg;
  }
  const p = points[0] ?? [0, 0];
  return { x: p[0], y: p[1], angle: 0 };
}

type Dir = "E" | "W" | "NE" | "SW" | "NW" | "SE" | "N" | "S";
const PAIRS: Array<[Dir, Dir]> = [
  ["E", "W"],
  ["NE", "SW"],
  ["NW", "SE"],
  ["N", "S"],
];
const SINGLE_ORDER: Dir[] = ["E", "W", "NE", "SW", "NW", "SE", "N", "S"];

const W = 1200;
const H = 760;
const CX = 600;
const CY = 380;
const PILL_W = 280;
const PILL_H = 64;
const DIAG = 150;

function branchGeometry(
  dir: Dir,
  count: number,
): { points: Pt[]; stationPts: Pt[]; labelMax: number; vertical: boolean } {
  const hx = PILL_W / 2;
  const hy = PILL_H / 2;
  const sx = dir.includes("E") ? 1 : dir.includes("W") ? -1 : 0;
  const sy = dir.includes("N") ? -1 : dir.includes("S") ? 1 : 0;
  if (dir === "N" || dir === "S") {
    const start: Pt = [CX, CY + sy * hy];
    const room = CY - hy - 40 - 50;
    const gap = Math.min(80, room / Math.max(1, count));
    const stationPts = Array.from(
      { length: count },
      (_, k) => [CX, CY + sy * (hy + 50 + k * gap)] as Pt,
    );
    const end = stationPts[stationPts.length - 1] ?? start;
    return {
      points: [start, [end[0], end[1] + sy * 18]],
      stationPts,
      labelMax: 140,
      vertical: true,
    };
  }
  if (sy === 0) {
    const start: Pt = [CX + sx * hx, CY];
    const first = hx + 90;
    const room = W / 2 - 60 - first;
    const gap = count > 1 ? Math.min(180, room / (count - 1)) : 0;
    const stationPts = Array.from(
      { length: count },
      (_, k) => [CX + sx * (first + k * gap), CY] as Pt,
    );
    const end = stationPts[stationPts.length - 1] ?? start;
    return {
      points: [start, [end[0] + sx * 24, CY]],
      stationPts,
      labelMax: count > 1 ? Math.min(220, gap * 2 - 16) : 220,
      vertical: false,
    };
  }
  // Diagonal out of the pill corner, then a horizontal run.
  const start: Pt = [CX + sx * (hx - 30), CY + sy * hy];
  const bend: Pt = [start[0] + sx * DIAG, start[1] + sy * DIAG];
  const first = Math.abs(bend[0] - CX) + 70;
  const room = W / 2 - 60 - first;
  const gap = count > 1 ? Math.min(180, room / (count - 1)) : 0;
  const stationPts = Array.from(
    { length: count },
    (_, k) => [CX + sx * (first + k * gap), bend[1]] as Pt,
  );
  const end = stationPts[stationPts.length - 1] ?? bend;
  return {
    points: [start, bend, [end[0] + sx * 24, bend[1]]],
    stationPts,
    labelMax: count > 1 ? Math.min(220, gap * 2 - 16) : 220,
    vertical: false,
  };
}

function distanceTo(points: Pt[], target: Pt): number {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const toT = Math.hypot(target[0] - a[0], target[1] - a[1]);
    const toB = Math.hypot(b[0] - target[0], b[1] - target[1]);
    if (Math.abs(toT + toB - seg) < 0.5) return acc + toT;
    acc += seg;
  }
  return acc;
}

function buildBranch(
  dir: Dir,
  stations: MetroInput[number]["stations"],
): LayoutBranch {
  const g = branchGeometry(dir, stations.length);
  const sx = dir.includes("E") ? 1 : dir.includes("W") ? -1 : 0;
  const out: LayoutStation[] = stations.map((s, k) => {
    const [x, y] = g.stationPts[k] as Pt;
    let max = g.labelMax;
    if (!g.vertical) {
      max = Math.min(max, 2 * (Math.min(x, W - x) - 12));
      if (y === CY)
        max = Math.min(max, 2 * (Math.abs(x - CX) - PILL_W / 2 - 10));
    }
    const label = fitLabel(s.name, max);
    if (g.vertical) {
      const right = k % 2 === 0;
      return {
        productId: s.id,
        x,
        y,
        at: distanceTo(g.points, [x, y]),
        label,
        full: s.name,
        lx: x + (right ? 20 : -20),
        ly: y + 4.5,
        anchor: right ? "start" : "end",
        soon: s.soon,
      };
    }
    const above = (k % 2 === 0) === (dir.includes("S") ? false : true);
    void sx;
    return {
      productId: s.id,
      x,
      y,
      at: distanceTo(g.points, [x, y]),
      label,
      full: s.name,
      lx: x,
      ly: above ? y - 22 : y + 32,
      anchor: "middle",
      soon: s.soon,
    };
  });
  const lastLive = [...out].reverse().find((s) => !s.soon);
  return {
    points: g.points,
    stations: out,
    length: polyLength(g.points),
    serviceLength: lastLive ? lastLive.at : 0,
  };
}

export function metroLayout(input: MetroInput, mobile: boolean): MetroLayout {
  const lines = input.filter((l) => l.stations.length > 0).slice(0, 8);
  return mobile ? stripLayout(lines) : networkLayout(lines);
}

function networkLayout(lines: MetroInput): MetroLayout {
  // Decide which lines split into two opposite branches (more than 3 stations, while directions remain).
  const split = new Set<number>();
  let used = lines.length;
  const bySize = lines
    .map((l, i) => ({ i, n: l.stations.length }))
    .sort((a, b) => b.n - a.n);
  for (const { i, n } of bySize) {
    if (n > 3 && used < 8 && split.size < PAIRS.length) {
      split.add(i);
      used++;
    }
  }
  const free = new Set<Dir>(SINGLE_ORDER);
  const assigned = new Map<number, Dir[]>();
  for (const i of split) {
    const pair = PAIRS.find(([a, b]) => free.has(a) && free.has(b));
    if (!pair) continue;
    free.delete(pair[0]);
    free.delete(pair[1]);
    assigned.set(i, pair);
  }
  lines.forEach((_, i) => {
    if (assigned.has(i)) return;
    const dir = SINGLE_ORDER.find((d) => free.has(d));
    if (!dir) return;
    free.delete(dir);
    assigned.set(i, [dir]);
  });
  return {
    w: W,
    h: H,
    central: { x: CX - PILL_W / 2, y: CY - PILL_H / 2, w: PILL_W, h: PILL_H },
    lines: lines.map((line, i) => {
      const dirs = assigned.get(i) ?? [];
      if (dirs.length === 2) {
        const half = Math.ceil(line.stations.length / 2);
        return {
          category: line.category,
          branches: [
            buildBranch(dirs[0] as Dir, line.stations.slice(0, half)),
            buildBranch(dirs[1] as Dir, line.stations.slice(half)),
          ],
        };
      }
      return {
        category: line.category,
        branches: [buildBranch(dirs[0] as Dir, line.stations)],
      };
    }),
  };
}

function stripLayout(lines: MetroInput): MetroLayout {
  const w = 360;
  const x = 44;
  const gap = 58;
  let y = 104;
  const headers: Array<{ category: string; x: number; y: number }> = [];
  const out: LayoutLine[] = lines.map((line) => {
    headers.push({ category: line.category, x, y });
    const top = y + 22;
    const pts = line.stations.map((_, k) => [x, top + 30 + k * gap] as Pt);
    const last = pts[pts.length - 1] ?? [x, top];
    const points: Pt[] = [
      [x, top],
      [x, last[1] + 16],
    ];
    const stations: LayoutStation[] = line.stations.map((s, k) => {
      const [sx, sy] = pts[k] as Pt;
      return {
        productId: s.id,
        x: sx,
        y: sy,
        at: sy - top,
        label: fitLabel(s.name, w - x - 40),
        full: s.name,
        lx: sx + 22,
        ly: sy + 4.5,
        anchor: "start",
        soon: s.soon,
      };
    });
    const lastLive = [...stations].reverse().find((s) => !s.soon);
    y = last[1] + 60;
    return {
      category: line.category,
      branches: [
        {
          points,
          stations,
          length: polyLength(points),
          serviceLength: lastLive ? lastLive.at : 0,
        },
      ],
    };
  });
  return {
    w,
    h: y,
    central: { x: 20, y: 18, w: 320, h: 56 },
    lines: out,
    headers,
  };
}

/** Axis-aligned boxes for markers and labels (used by tests to prove no overlaps). */
export function layoutBoxes(
  layout: MetroLayout,
): Array<{ x: number; y: number; w: number; h: number; kind: string }> {
  const boxes = [{ ...layout.central, kind: "central" }];
  for (const line of layout.lines) {
    for (const b of line.branches) {
      for (const s of b.stations) {
        const lw = labelWidth(s.label);
        const lx =
          s.anchor === "middle"
            ? s.lx - lw / 2
            : s.anchor === "end"
              ? s.lx - lw
              : s.lx;
        boxes.push({
          x: lx,
          y: s.ly - LABEL_FONT,
          w: lw,
          h: LABEL_FONT + 4,
          kind: `label:${s.productId}`,
        });
        boxes.push({
          x: s.x - 9,
          y: s.y - 9,
          w: 18,
          h: 18,
          kind: `marker:${s.productId}`,
        });
      }
    }
  }
  return boxes;
}
