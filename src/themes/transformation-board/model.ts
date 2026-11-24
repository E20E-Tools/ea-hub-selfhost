/**
 * Pure helpers for Transformation Board (browser-safe, deterministic). The board geometry is
 * Circuit Core's layout; legacy filenames, slider keys and interpolation come from Legacy → Digital.
 */
import {
  chipCode,
  circuitLayout,
  type Box,
  type CircuitLayout,
} from "../circuit-core/layout";
import {
  cubicPath,
  lerp,
  lerpPoints,
  legacyFileName,
  legacyKind,
  morphAt,
  sliderKey,
  type Pt,
} from "../legacy-to-digital/model";

export { chipCode, cubicPath, legacyFileName, legacyKind, morphAt, sliderKey };
export type { Box, Pt };

/** Resting handle position from the reading start: 42% legacy = 58% digital. */
export const TB_REST = 0.42;

/** Digital share shown in the readout and the slider value (0–100). */
export function transformPercent(h: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, h))) * 100);
}

/** Polyline → cubic Bézier control points (1 + 3k), so straight segments can morph against curves. */
export function polylineToCubic(pts: Pt[]): Pt[] {
  const first = pts[0];
  if (!first) return [];
  const out: Pt[] = [[first[0], first[1]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    out.push(
      [lerp(a[0], b[0], 1 / 3), lerp(a[1], b[1], 1 / 3)],
      [lerp(a[0], b[0], 2 / 3), lerp(a[1], b[1], 2 / 3)],
      [b[0], b[1]],
    );
  }
  return out;
}

/** Deterministic pseudo-random values in -0.5..0.5. */
export function noise(seed: number, count: number): number[] {
  let x = Math.sin(seed * 9301 + 49297) * 233280;
  return Array.from({ length: count }, () => {
    x = Math.sin(x) * 10000;
    return x - Math.floor(x) - 0.5;
  });
}

/**
 * Tangled legacy cable with the same control-point count as `trace` (chip → core). It starts at
 * the chip anchor, loops around and stops short of the core ("goes nowhere"); joints are smooth.
 */
export function spaghetti(
  trace: Pt[],
  seed: number,
  bounds: { w: number; h: number },
  amp: number,
): Pt[] {
  const n = trace.length;
  const start = trace[0];
  const target = trace[n - 1];
  if (!start || !target || n < 2) return trace.map((p) => [p[0], p[1]] as Pt);
  const pad = 6;
  const clamp = ([x, y]: Pt): Pt => [
    Math.max(pad, Math.min(bounds.w - pad, x)),
    Math.max(pad, Math.min(bounds.h - pad, y)),
  ];
  const r = noise(seed, n * 2 + 2);
  const end = clamp([
    lerp(start[0], target[0], 0.45) + r[0]! * amp * 1.6,
    lerp(start[1], target[1], 0.45) + r[1]! * amp * 1.6,
  ]);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out.push([start[0], start[1]]);
      continue;
    }
    if (i === n - 1) {
      out.push(end);
      continue;
    }
    if (i % 3 === 1 && i > 1) {
      // Mirror the previous handle across the joint for a smooth cable.
      const joint = out[i - 1]!;
      const prev = out[i - 2]!;
      out.push(clamp([2 * joint[0] - prev[0], 2 * joint[1] - prev[1]]));
      continue;
    }
    const t = i / (n - 1);
    const bulge = 0.5 + Math.sin(Math.PI * t);
    out.push(
      clamp([
        lerp(start[0], end[0], t) + r[2 + 2 * i]! * amp * 2 * bulge,
        lerp(start[1], end[1], t) + r[3 + 2 * i]! * amp * 2 * bulge,
      ]),
    );
  }
  return out;
}

/** Splits long segments (same shape) so every cable has enough joints to tangle convincingly. */
export function subdivide(pts: Pt[], maxLen: number): Pt[] {
  const first = pts[0];
  if (!first) return [];
  const out: Pt[] = [[first[0], first[1]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const k = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen),
    );
    for (let j = 1; j <= k; j++)
      out.push(
        j === k
          ? [b[0], b[1]]
          : [lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)],
      );
  }
  return out;
}

export type TbCable = {
  /** Clean chamfered trace as cubic points, chip end first. */
  trace: Pt[];
  /** Legacy spaghetti with the same point count, chip end first. */
  mess: Pt[];
  vias: Array<[number, number]>;
};
export type TbBoard = CircuitLayout & { cables: TbCable[] };

/** Circuit Core's board plus a morphable cable per chip. */
export function tbBoard(count: number, mobile: boolean): TbBoard {
  const layout = circuitLayout(count, mobile);
  const cables = layout.traces.map((tr, i) => {
    const trace = polylineToCubic(
      subdivide([...tr.pts].reverse() as Pt[], mobile ? 40 : 46),
    );
    return {
      trace,
      mess: spaghetti(trace, i + 1, layout, mobile ? 30 : 46),
      vias: tr.vias,
    };
  });
  return { ...layout, cables };
}

/** Cable shape for a morph amount: 0 = spaghetti, 1 = the chamfered trace. */
export function cableAt(cable: TbCable, m: number): Pt[] {
  // Exact at the ends so a fully digital cable is the trace itself (no float drift).
  if (m >= 1) return cable.trace.map((p) => [p[0], p[1]] as Pt);
  if (m <= 0) return cable.mess.map((p) => [p[0], p[1]] as Pt);
  return lerpPoints(cable.mess, cable.trace, m);
}

/** On-curve joints (every third point, excluding the ends) for burnt legacy vias. */
export function cableJoints(points: Pt[], max = 2): Pt[] {
  const joints = points.filter(
    (_, i) => i > 0 && i < points.length - 1 && i % 3 === 0,
  );
  if (joints.length <= max) return joints;
  const step = joints.length / max;
  return Array.from(
    { length: max },
    (_, k) => joints[Math.floor(k * step + step / 2)]!,
  );
}

/**
 * Resting handle position nearest `preferred` where no element is mid-morph: every item centre
 * (`us`, 0 = reading start) sits at least `clear` away, so each product shows as a whole file or chip.
 */
export function restPosition(
  us: number[],
  preferred: number,
  clear: number,
  range: [number, number] = [0.3, 0.56],
): number {
  const ok = (h: number) => us.every((u) => Math.abs(u - h) >= clear);
  for (let k = 0; k <= 60; k++) {
    for (const h of k === 0
      ? [preferred]
      : [preferred + k * 0.005, preferred - k * 0.005]) {
      if (h >= range[0] && h <= range[1] && ok(h))
        return Math.round(h * 1000) / 1000;
    }
  }
  return preferred;
}

/** Handle position the board settles to after a drag: the nearest spot where nothing is mid-morph. */
export function settlePosition(
  us: number[],
  at: number,
  clear: number,
): number {
  return restPosition(
    us,
    Math.max(0.02, Math.min(0.98, at)),
    clear,
    [0.02, 0.98],
  );
}

/** Ease that runs slightly past the target and comes back — the elastic settle after a drag. */
export function elasticSettle(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/** Live board measurements. Everything here is read off the real catalog, never invented. */
export type TbTelemetry = {
  available: number;
  soon: number;
  nextLaunch: { id: string; name: string; date: string } | null;
};

type TelemetryInput = {
  id: string;
  name: string;
  comingSoon?: boolean;
  publicationDate?: string;
};

export function boardTelemetry(products: TelemetryInput[]): TbTelemetry {
  const soon = products.filter((p) => p.comingSoon);
  const upcoming = soon
    .filter(
      (p) =>
        typeof p.publicationDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.publicationDate),
    )
    .sort((a, b) => (a.publicationDate! < b.publicationDate! ? -1 : 1));
  const next = upcoming[0];
  return {
    available: products.length - soon.length,
    soon: soon.length,
    nextLaunch: next
      ? { id: next.id, name: next.name, date: next.publicationDate! }
      : null,
  };
}

/** Journey stops on the handle's rail, in order of transformation (01 = almost all legacy). */
export type TbStopId = 1 | 2 | 3 | 4;
export type TbStop = { id: TbStopId; h: number };

/** Centres along the split axis (0 = reading start) for the core then each chip, as the stage computes them. */
export function boardCentres(
  board: CircuitLayout,
  count: number,
  o: {
    vertical: boolean;
    rtl: boolean;
    width: number;
    height: number;
    top: number;
  },
): number[] {
  const scale = o.width / board.w;
  const uOf = (b: Box) =>
    o.vertical
      ? Math.max(
          0,
          Math.min(
            1,
            (o.top + (b.y + b.h / 2) * scale) / Math.max(1, o.height),
          ),
        )
      : o.rtl
        ? 1 - (b.x + b.w / 2) / board.w
        : (b.x + b.w / 2) / board.w;
  return [board.core, ...board.chips.slice(0, count)].map(uOf);
}

/**
 * Four handle positions read off the real layout (`us[0]` = core, the rest = chips). Every stop is a
 * clear position (nothing mid-morph). Items whose centre lies after the handle are digital.
 * Stops that a layout cannot tell apart are dropped instead of overlapping.
 */
export function journeyStops(us: number[], clear: number): TbStop[] {
  const core = us[0];
  if (core === undefined) return [];
  const chips = us.slice(1);
  const ok = (h: number) => us.every((u) => Math.abs(u - h) >= clear);
  const cands: number[] = [];
  for (let k = 4; k <= 196; k++) {
    const h = k / 200;
    if (ok(h)) cands.push(h);
  }
  const sorted = [...us].sort((a, b) => a - b);
  const mids = sorted
    .slice(1)
    .map((u, i) => Math.round(((u + sorted[i]!) / 2) * 1000) / 1000)
    .filter((_, i) => sorted[i + 1]! - sorted[i]! > 0.02);
  const near = (target: number, pred: (h: number) => boolean) => {
    let best: number | null = null;
    for (const h of cands)
      if (
        pred(h) &&
        (best === null || Math.abs(h - target) < Math.abs(best - target))
      )
        best = h;
    if (best !== null) return settlePosition(us, best, clear);
    // Dense layouts (many products on a phone) have no fully clear spot: use the most open gap instead.
    for (const h of mids)
      if (
        pred(h) &&
        (best === null || Math.abs(h - target) < Math.abs(best - target))
      )
        best = h;
    return best;
  };
  const s1 = settlePosition(us, 0.96, clear);
  const s4 = settlePosition(us, 0.04, clear);
  const s3 = near(core, (h) => h < core && h < s1 && h > s4);
  const after = chips.filter((u) => u > core);
  const far = after.length ? Math.max(...after) : core;
  const s2 = near(
    (core + far) / 2,
    (h) => h > core && h < s1 && chips.some((u) => u > h),
  );
  const raw: Array<{ id: TbStopId; h: number | null }> = [
    { id: 1, h: s1 },
    { id: 2, h: s2 },
    { id: 3, h: s3 },
    { id: 4, h: s4 },
  ];
  const out: TbStop[] = [];
  for (const s of raw) {
    if (s.h === null) continue;
    const prev = out[out.length - 1];
    if (prev && prev.h - s.h < 0.02) continue;
    out.push({ id: s.id, h: s.h });
  }
  return out;
}

/** Index of the stop nearest the handle (the active stage). */
export function activeStop(stops: TbStop[], h: number): number {
  let best = 0;
  stops.forEach((s, i) => {
    if (Math.abs(s.h - h) < Math.abs(stops[best]!.h - h)) best = i;
  });
  return best;
}

/** A stop is passed once the handle is at or beyond it toward digital (smaller h). */
export function stopPassed(stop: TbStop, h: number): boolean {
  return h <= stop.h + 0.002;
}

/** Products shown digital at a handle position (morph above one half). */
export function onlineCount(chipUs: number[], h: number, band: number): number {
  return chipUs.filter((u) => morphAt(u, h, band) > 0.5).length;
}

/**
 * Pushes label centres apart (px) so pills of `widths` never overlap and stay inside [0, total].
 * Returns null when they cannot fit side by side.
 */
export function spreadLabels(
  xs: number[],
  widths: number[],
  total: number,
  gap = 6,
  pad = 6,
): number[] | null {
  const n = xs.length;
  const sum =
    widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, n - 1) + pad * 2;
  if (sum > total) return null;
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  const pos = xs.slice();
  // Forward pass: clamp to the start edge and push right.
  let edge = pad;
  for (const i of order) {
    const half = widths[i]! / 2;
    pos[i] = Math.max(pos[i]!, edge + half);
    edge = pos[i]! + half + gap;
  }
  // Backward pass: clamp to the end edge and push left.
  edge = total - pad;
  for (const i of [...order].reverse()) {
    const half = widths[i]! / 2;
    pos[i] = Math.min(pos[i]!, edge - half);
    edge = pos[i]! - half - gap;
  }
  return pos;
}
