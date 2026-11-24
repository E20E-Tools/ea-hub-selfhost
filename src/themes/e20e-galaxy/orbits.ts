/** Pure orbital mechanics for the E20E Galaxy stage (browser-safe, deterministic). */
export type Orbit = {
  /** Ring index (0 = innermost). */
  ring: number;
  /** Semi-major axis as a fraction of the outermost ring (0..1]. */
  a: number;
  /** Starting phase in radians. */
  phase: number;
  /** Seconds per revolution (Kepler-ish: T ∝ a^1.5). */
  period: number;
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const BASE_PERIOD = 70;

/** One planet per ring up to six products; beyond that two per ring, phased half a turn apart. */
export function orbitLayout(count: number): Orbit[] {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  if (!n) return [];
  const rings = n <= 6 ? n : Math.ceil(n / 2);
  const inner = rings === 1 ? 1 : 0.34;
  const out: Orbit[] = [];
  for (let i = 0; i < n; i++) {
    const ring = n <= 6 ? i : i % rings;
    const second = n > 6 && i >= rings;
    const a = rings === 1 ? 1 : inner + ((1 - inner) * ring) / (rings - 1);
    const phase =
      (((ring * GOLDEN + (second ? Math.PI : 0)) % (2 * Math.PI)) +
        2 * Math.PI) %
      (2 * Math.PI);
    out.push({ ring, a, phase, period: BASE_PERIOD * a ** 1.5 });
  }
  return out;
}

export type Projected = {
  x: number;
  y: number;
  z: number;
  scale: number;
  angle: number;
};

/**
 * Projects an orbit onto the tilted plane at time t (seconds). `tilt` is the ry/rx ratio.
 * z is +1 at the nearest point (in front of the sun) and -1 at the farthest.
 */
export function project(
  orbit: Orbit,
  t: number,
  tilt: number,
  extraPhase = 0,
): Projected {
  const angle = orbit.phase + extraPhase + (2 * Math.PI * t) / orbit.period;
  const z = Math.sin(angle);
  return {
    x: orbit.a * Math.cos(angle),
    y: orbit.a * tilt * z,
    z,
    scale: 0.72 + 0.28 * ((z + 1) / 2),
    angle,
  };
}

/** True when the planet is on the far side and its centre falls inside the sun's disc. */
export function behindSun(
  p: Pick<Projected, "x" | "y" | "z">,
  sunRadius: number,
): boolean {
  return p.z < 0 && Math.hypot(p.x, p.y) < sunRadius;
}

/** Stacking order: far planets first; the sun sits between far (z<0) and near (z>=0). Returns z-index. */
export function depthIndex(z: number): number {
  return z < 0 ? 10 + Math.round((z + 1) * 40) : 60 + Math.round(z * 40);
}
export const SUN_Z = 55;

/** "T-11d 04:22:17"; null once the moment has passed. */
export function formatTMinus(ms: number): string | null {
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `T-${d}d ${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Short "T-12d" label (rounded up so the final day still reads T-1d). */
export function formatTDays(ms: number): string | null {
  if (!(ms > 0)) return null;
  return `T-${Math.ceil(ms / 86_400_000)}d`;
}

/** Stable hue (0–359) from a product id for rim glows. */
export function idHue(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % 360;
}

/**
 * Horizontal placement of a planet label: on the reading-end side (right in LTR, left in RTL),
 * flipped to the other side when it would leave the stage, then clamped fully inside.
 */
export function placeLabel(
  x: number,
  gap: number,
  width: number,
  stageWidth: number,
  rtl: boolean,
  pad = 8,
): { x: number; side: "left" | "right" } {
  const after = x + gap;
  const before = x - gap - width;
  const fitsAfter = after + width <= stageWidth - pad;
  const fitsBefore = before >= pad;
  const right = rtl ? !fitsBefore && fitsAfter : fitsAfter || !fitsBefore;
  const lx = Math.max(
    pad,
    Math.min(stageWidth - pad - width, right ? after : before),
  );
  return { x: lx, side: right ? "right" : "left" };
}
