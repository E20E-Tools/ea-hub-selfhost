/** Exact Islamic-geometry helpers for Digital Mashrabiya (browser-safe, deterministic). */
export type P = [number, number];

/** Inner/outer radius ratio of the Khatam (two squares overlaid at 45°): cos(45°)/cos(22.5°). */
export const KHATAM_RATIO = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);

/** Regular n-pointed star: 2n vertices alternating outer (R) and inner (r), first tip at `rot`. */
export function starPoints(
  cx: number,
  cy: number,
  R: number,
  r: number,
  n = 8,
  rot = -Math.PI / 2,
): P[] {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (i * Math.PI) / n;
    const rad = i % 2 === 0 ? R : r;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as P;
  });
}
export function khatam(cx: number, cy: number, R: number, rot = -Math.PI / 2): P[] {
  return starPoints(cx, cy, R, R * KHATAM_RATIO, 8, rot);
}
export function polygon(
  cx: number,
  cy: number,
  R: number,
  n: number,
  rot = -Math.PI / 2 + Math.PI / n,
): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (2 * Math.PI * i) / n;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as P;
  });
}
const f = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 100) / 100);
export function toPath(points: P[], close = true): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + (close ? "Z" : "");
}

/**
 * One repeat of the classic star-and-cross Khatam tessellation on a square grid of side s:
 * an 8-point star whose axial tips touch the cell edges, plus the diagonal girih lines that
 * continue from its 45° tips to the cell corners where four cells meet as a cross.
 */
export function tessellationTile(s: number): string {
  const c = s / 2;
  const star = khatam(c, c, s / 2, 0);
  const diag = star.filter((_, i) => i % 4 === 2);
  const corners: P[] = [
    [s, s],
    [0, s],
    [0, 0],
    [s, 0],
  ];
  const lines = diag
    .map((p, i) => `M${f(p[0])} ${f(p[1])}L${f(corners[i]![0])} ${f(corners[i]![1])}`)
    .join("");
  return toPath(star) + lines;
}

/** Octilinear "girih trace" between two points: axial, then 45° diagonal, then axial again. */
export function tracePath(from: P, to: P): P[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const rest = Math.abs(dx) > Math.abs(dy) ? [Math.abs(dx) - d, 0] : [0, Math.abs(dy) - d];
  const half: P = [(rest[0]! / 2) * sx, (rest[1]! / 2) * sy];
  const a: P = [from[0] + half[0], from[1] + half[1]];
  const b: P = [a[0] + d * sx, a[1] + d * sy];
  const pts: P[] = [from, a, b, to];
  return pts.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 0.01,
  );
}

export type Tile = { x: number; y: number; size: number; angle: number; ring: number };
export type Composition = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  medallion: number;
  tiles: Tile[];
};

/** Tiles on one ring (≤8) or two rings (inner = half, outer offset half a step), mirrored for RTL. */
export function ringComposition(count: number, rtl: boolean): Composition {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  const two = n > 8;
  const w = 1100;
  const h = two ? 900 : 780;
  const cx = w / 2;
  const cy = h / 2;
  const medallion = 120;
  const inner = two ? Math.floor(n / 2) : n;
  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const ring = two && i >= inner ? 1 : 0;
    const k = ring ? i - inner : i;
    const m = ring ? n - inner : inner;
    const offset = ring ? Math.PI / m : 0;
    let angle = -Math.PI / 2 + offset + (2 * Math.PI * k) / Math.max(1, m);
    if (rtl) angle = Math.PI - angle;
    const radius = two ? (ring ? 360 : 225) : 290;
    const size = two ? 112 : Math.min(150, ((2 * Math.PI * radius) / Math.max(n, 1)) * 0.72);
    tiles.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      size,
      angle,
      ring,
    });
  }
  return { w, h, cx, cy, medallion, tiles };
}

/** Phone: medallion on top, tiles in a two-column grid (RTL starts on the right). */
export function gridComposition(count: number, rtl: boolean): Composition {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  const w = 360;
  const tiles: Tile[] = Array.from({ length: n }, (_, i) => {
    const col = i % 2 === 0 ? (rtl ? 1 : 0) : rtl ? 0 : 1;
    return {
      x: col ? 268 : 92,
      y: 300 + Math.floor(i / 2) * 168,
      size: 140,
      angle: Math.PI / 2,
      ring: 0,
    };
  });
  return { w, h: 300 + Math.ceil(n / 2) * 168 - 40, cx: 180, cy: 116, medallion: 88, tiles };
}

/** Pointed (equilateral) arch as a CSS polygon; springing line at `spring` (0..1 of the height). */
export function pointedArch(spring = 0.42, steps = 14): string {
  const pts: string[] = ["0% 100%", `0% ${spring * 100}%`];
  // Left arc: centre at the right springing point, radius = full width (equilateral arch).
  for (let i = 1; i <= steps; i++) {
    const a = Math.PI - (Math.PI / 3) * (i / steps);
    const x = 1 + Math.cos(a);
    const y = spring - Math.sin(a) * (spring / Math.sin(Math.PI / 3));
    pts.push(`${f(x * 100)}% ${f(Math.max(0, y) * 100)}%`);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const a = Math.PI - (Math.PI / 3) * (i / steps);
    const x = -Math.cos(a);
    const y = spring - Math.sin(a) * (spring / Math.sin(Math.PI / 3));
    pts.push(`${f(x * 100)}% ${f(Math.max(0, y) * 100)}%`);
  }
  pts.push("100% 100%");
  return `polygon(${pts.join(", ")})`;
}
