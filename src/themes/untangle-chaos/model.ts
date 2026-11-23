/** Pure helpers for "Untangle the Chaos" (browser-safe, deterministic). */
export type Pt = { x: number; y: number };

export const SCAN_MS = 650;
export const MORPH_MS = 1000;
export const FLY_MS = 450;
export const AUTO_START_MS = 2000;
export const SESSION_KEY = "e20e-untangle-auto";

/** Legacy files alternate right/left (reading start first) and stack down each side. */
export function fileSlots(n: number, w: number, h: number, mobile: boolean): Pt[] {
  if (mobile) {
    const cols = 2;
    const rows = Math.ceil(n / cols);
    return Array.from({ length: n }, (_, i) => ({
      x: w * (i % cols === 0 ? 0.25 : 0.75),
      y: h * 0.5 + ((Math.floor(i / cols) + 0.5) / Math.max(1, rows)) * h * 0.46,
    }));
  }
  const perSide = Math.ceil(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2;
    const row = Math.floor(i / 2);
    return {
      x: w * (side === 0 ? 0.14 : 0.86),
      y: h * (0.16 + ((row + 0.5) / Math.max(1, perSide)) * 0.7),
    };
  });
}

/** Core position (the CRT, later the E20E core). */
export function corePoint(w: number, h: number, mobile: boolean): Pt {
  return { x: w / 2, y: mobile ? h * 0.22 : h * 0.5 };
}

/** Wobbly tangle: points from a file toward a dead-end plug that never reaches the core. */
export function tanglePath(from: Pt, core: Pt, seed: number, t: number): Pt[] {
  const pts: Pt[] = [];
  const steps = 14;
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    const reach = 0.72; // plug stops short of the core
    const x = from.x + (core.x - from.x) * u * reach;
    const y = from.y + (core.y - from.y) * u * reach;
    const amp = 38 * Math.sin(Math.PI * u);
    const wob =
      Math.sin(u * 9 + seed * 1.7 + t * 0.0009) + 0.6 * Math.cos(u * 15 - seed + t * 0.0013);
    pts.push({ x: x + amp * wob, y: y + amp * Math.cos(u * 7 + seed * 2.3 + t * 0.0007) });
  }
  return pts;
}

/** Clean orthogonal route (horizontal, vertical, horizontal) from a file to the core. */
export function orthoRoute(from: Pt, core: Pt): Pt[] {
  const midX = from.x + (core.x - from.x) * 0.5;
  return [from, { x: midX, y: from.y }, { x: midX, y: core.y }, core];
}

/** Point at distance share `u` (0–1) along a polyline. */
export function along(path: Pt[], u: number): Pt {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push(d);
    total += d;
  }
  let target = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i]!;
    if (target <= d || i === segs.length - 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const k = d === 0 ? 0 : Math.min(1, target / d);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    target -= d;
  }
  return path[0] ?? { x: 0, y: 0 };
}

export type FixPhase = "legacy" | "fly" | "scan" | "morph" | "done";

/** Where one file is in its fix sequence, `ms` after the visitor (or Archy) picked it. */
export function fixPhase(ms: number | null): { phase: FixPhase; k: number } {
  if (ms === null || ms < 0) return { phase: "legacy", k: 0 };
  if (ms < FLY_MS) return { phase: "fly", k: ms / FLY_MS };
  if (ms < FLY_MS + SCAN_MS) return { phase: "scan", k: (ms - FLY_MS) / SCAN_MS };
  if (ms < FLY_MS + SCAN_MS + MORPH_MS)
    return { phase: "morph", k: (ms - FLY_MS - SCAN_MS) / MORPH_MS };
  return { phase: "done", k: 1 };
}
export const FIX_TOTAL_MS = FLY_MS + SCAN_MS + MORPH_MS;

/** Elastic overshoot used when a file pops into a tool chip. */
export function elastic(k: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return Math.pow(2, -10 * k) * Math.sin(((k * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
}

/** Background mix from beige (0) to white (1) with progress. */
export function backgroundMix(done: number, total: number): number {
  return total <= 0 ? 1 : Math.max(0, Math.min(1, done / total));
}

export function mixHex(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) =>
      Math.round(v + ((pb[i] ?? v) - v) * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Next file Archy fixes in "fix all": first still-legacy index in order. */
export function nextUnfixed(fixed: ReadonlySet<number>, n: number): number | null {
  for (let i = 0; i < n; i++) if (!fixed.has(i)) return i;
  return null;
}

/** First visit in the session auto-starts unless the visitor already interacted. */
export function shouldAutoStart(
  alreadyRan: boolean,
  interacted: boolean,
  animate: boolean,
): boolean {
  return animate && !alreadyRan && !interacted;
}
