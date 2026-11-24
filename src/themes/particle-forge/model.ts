/** Pure helpers for "Particle Forge" (browser-safe, deterministic). */
export type Pt = { x: number; y: number };
export const FORMATION_MS = 2800;
export const FORMATIONS = ["grid", "clusters", "title"] as const;
export type Formation = (typeof FORMATIONS)[number];

export function particleCount(mobile: boolean, scale: number): number {
  return Math.round(
    (mobile ? 180 : 400) * Math.min(1.25, Math.max(0.5, scale)),
  );
}

/** Which formation is shown and how far into it (k 0–1) at time `ms`. */
export function formationAt(ms: number): {
  formation: Formation;
  index: number;
  k: number;
} {
  const step = Math.floor(ms / FORMATION_MS);
  const index = ((step % 3) + 3) % 3;
  return {
    formation: FORMATIONS[index]!,
    index,
    k: (ms % FORMATION_MS) / FORMATION_MS,
  };
}

/** Old spreadsheet grid targets. */
export function gridTargets(n: number, w: number, h: number): Pt[] {
  const cols = Math.max(4, Math.round(Math.sqrt((n * w) / h)));
  const rows = Math.ceil(n / cols);
  const gx = (w * 0.76) / Math.max(1, cols - 1);
  const gy = (h * 0.6) / Math.max(1, rows - 1);
  return Array.from({ length: n }, (_, i) => ({
    x: w * 0.12 + (i % cols) * gx,
    y: h * 0.2 + Math.floor(i / cols) * gy,
  }));
}

/** Cluster centres, one per product, in a row (or two rows on narrow stages). */
export function clusterCentres(count: number, w: number, h: number): Pt[] {
  const rows = w < 640 && count > 3 ? 2 : 1;
  const perRow = Math.ceil(count / rows);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = row === rows - 1 ? count - perRow * row : perRow;
    return {
      x: (w * (col + 0.5)) / inRow,
      y: rows === 1 ? h * 0.45 : h * (0.3 + row * 0.36),
    };
  });
}

/** Deterministic spread around each centre (golden-angle spiral). */
export function clusterTargets(n: number, centres: Pt[], radius: number): Pt[] {
  if (!centres.length) return gridTargets(n, radius * 8, radius * 4);
  return Array.from({ length: n }, (_, i) => {
    const c = centres[i % centres.length]!;
    const j = Math.floor(i / centres.length);
    const r =
      radius *
      Math.sqrt((j + 0.5) / Math.max(1, Math.ceil(n / centres.length)));
    const a = j * 2.39996;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  });
}

/** Samples opaque pixels of an RGBA buffer into at most `n` targets (scaled by `step`). */
export function sampleText(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  n: number,
  step = 4,
): Pt[] {
  const hits: Pt[] = [];
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step)
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 128) hits.push({ x, y });
  if (!hits.length) return [];
  return Array.from(
    { length: n },
    (_, i) => hits[Math.floor((i * hits.length) / n)]!,
  );
}

/** Pointer push: displacement away from the pointer within `radius`. */
export function repel(
  p: Pt,
  pointer: Pt | null,
  radius: number,
  strength: number,
): Pt {
  if (!pointer) return { x: 0, y: 0 };
  const dx = p.x - pointer.x;
  const dy = p.y - pointer.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius || d === 0) return { x: 0, y: 0 };
  const f = ((radius - d) / radius) * strength;
  return { x: (dx / d) * f, y: (dy / d) * f };
}

/** Index of the cluster centre under a point, or -1. */
export function clusterAt(p: Pt, centres: Pt[], radius: number): number {
  let best = -1;
  let bestD = radius;
  centres.forEach((c, i) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
