/** Pure isometric city maths for the EA Metropolis stage (browser-safe, deterministic). */

export type GPt = [number, number];
export type Footprint = { x: number; y: number; w: number; d: number };
export type BuildingKind = "tower" | "stepped" | "twisted" | "dome";
export type Lot = { cx: number; cy: number; footprint: Footprint; route: GPt[] };

/** 2:1 isometric tile (screen px per grid unit is half of these). */
export const TW = 64;
export const TH = 32;
export const HQ: Footprint = { x: -1, y: -1, w: 2, d: 2 };

export function iso(gx: number, gy: number, z = 0): [number, number] {
  return [((gx - gy) * TW) / 2, ((gx + gy) * TH) / 2 - z];
}

/** Lot centres on a 3-unit grid (2×2 lots, 1-unit roads), nearest to HQ first. */
const LOTS: GPt[] = [
  // Front-centre lots last so early buildings never hide HQ.
  [3, -3],
  [-3, 3],
  [0, -3],
  [-3, 0],
  [-3, -3],
  [3, 0],
  [0, 3],
  [3, 3],
  [6, 0],
  [-6, 0],
  [0, -6],
  [0, 6],
];

const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 1);

/** Orthogonal road route from a lot's frontage to the HQ ring road (|g| = 1.5). */
export function routeToHQ(cx: number, cy: number): GPt[] {
  const pts: GPt[] = [];
  if (cy !== 0) {
    const roadY = cy - 1.5 * sgn(cy);
    pts.push([cx, roadY]);
    if (Math.abs(roadY) > 1.5) {
      const col = cx === 0 ? 1.5 : cx - 1.5 * sgn(cx);
      pts.push([col, roadY], [col, 1.5 * sgn(cy)]);
      if (Math.abs(col) > 1.5) pts.push([1.5 * sgn(col), 1.5 * sgn(cy)]);
    } else if (Math.abs(cx) > 1.5) {
      pts.push([1.5 * sgn(cx), roadY]);
    }
  } else {
    const roadX = cx - 1.5 * sgn(cx);
    pts.push([roadX, 0]);
    if (Math.abs(roadX) > 1.5) pts.push([roadX, 1.5], [1.5 * sgn(cx), 1.5]);
  }
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Deterministic 0..1 stream seeded from a string. */
export function rng(seed: string): () => number {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export type BuildingSpec = {
  kind: BuildingKind;
  height: number; // px
  footprint: Footprint;
  hue: number; // base hue (oklch)
  windowGap: number; // px between floors
};

const KINDS: BuildingKind[] = ["tower", "stepped", "twisted", "dome"];

/** Procedural, deterministic building from the product id; height grows with feature count. */
export function buildingFor(id: string, features: number, lot: GPt): BuildingSpec {
  const r = rng(id);
  const kind = KINDS[hash(id) % KINDS.length]!;
  const w = 1.35 + r() * 0.5;
  const d = 1.35 + r() * 0.5;
  const f = Math.min(Math.max(features, 0), 8);
  return {
    kind,
    height: Math.round(70 + f * 14 + r() * 18),
    footprint: {
      x: lot[0] - w / 2,
      y: lot[1] - d / 2,
      w: Math.round(w * 100) / 100,
      d: Math.round(d * 100) / 100,
    },
    hue: Math.round(200 + r() * 70),
    windowGap: kind === "dome" ? 12 : 10,
  };
}

export function layoutCity(count: number): Lot[] {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  return LOTS.slice(0, n).map(([cx, cy]) => ({
    cx,
    cy,
    footprint: { x: cx - 1, y: cy - 1, w: 2, d: 2 },
    route: routeToHQ(cx, cy),
  }));
}

/** Unused inner-ring lots become small parks so the city never has holes. */
export function parkLots(count: number): GPt[] {
  return LOTS.slice(Math.max(0, Math.min(8, count)), 8);
}

/** Grid extent (inclusive of a 1.5-unit kerb) for slabs and roads. */
export function cityBounds(lots: Lot[]): { min: number; max: number } {
  const reach = Math.max(3, ...lots.map((l) => Math.max(Math.abs(l.cx), Math.abs(l.cy))));
  return { min: -(reach + 1.5), max: reach + 1.5 };
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

/** Three visible faces of an iso box: top, left (max-y side) and right (max-x side). */
export function boxFaces(
  f: Footprint,
  z0: number,
  h: number,
): { top: string; left: string; right: string } {
  const x1 = f.x + f.w,
    y1 = f.y + f.d,
    z1 = z0 + h;
  const P = (gx: number, gy: number, z: number) =>
    iso(gx, gy, z)
      .map((v) => Math.round(v * 10) / 10)
      .join(",");
  return {
    top: [P(f.x, f.y, z1), P(x1, f.y, z1), P(x1, y1, z1), P(f.x, y1, z1)].join(" "),
    left: [P(f.x, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(f.x, y1, z1)].join(" "),
    right: [P(x1, f.y, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, f.y, z1)].join(" "),
  };
}

/* ---------- Day → night ---------- */
const SKY: [number, string, string][] = [
  [0, "#F6C177", "#FFE3B0"],
  [0.25, "#8EC5FF", "#D8ECFF"],
  [0.5, "#6D5BD0", "#F2A07B"],
  [0.72, "#0E1530", "#1E2756"],
  [0.9, "#0E1530", "#2B2F66"],
  [1, "#F6C177", "#FFE3B0"],
];
function hex(c: string): number[] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
function mixHex(a: string, b: string, t: number): string {
  const A = hex(a),
    B = hex(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i]! - v) * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}
/** Sky gradient (top, horizon) for a cycle phase in [0, 1). */
export function skyAt(phase: number): { top: string; horizon: string } {
  const p = ((phase % 1) + 1) % 1;
  for (let i = 1; i < SKY.length; i++) {
    const [p1, t1, h1] = SKY[i]!;
    const [p0, t0, h0] = SKY[i - 1]!;
    if (p <= p1) {
      const k = (p - p0) / (p1 - p0 || 1);
      return { top: mixHex(t0, t1, k), horizon: mixHex(h0, h1, k) };
    }
  }
  return { top: SKY[0]![1], horizon: SKY[0]![2] };
}
/** 0 = full day, 1 = full night. */
export function nightAt(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const ramp = (a: number, b: number, v: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  if (p < 0.45) return 1 - ramp(0, 0.08, p);
  if (p < 0.7) return ramp(0.45, 0.7, p);
  return p < 0.92 ? 1 : 1 - ramp(0.92, 1, p) * 0.15;
}
