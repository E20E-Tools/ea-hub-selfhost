/** Pure helpers for "Reveal Lens" (browser-safe). */
export const LENS_RADIUS = 90;
export const EXPAND_MS = 900;
export const LONG_PRESS_MS = 550;
export const IDLE_MS = 2500;

/** Calm Lissajous wander used while the visitor is idle. */
export function lissajous(t: number, w: number, h: number, speed = 1) {
  const s = t * 0.00035 * speed;
  return {
    x: w / 2 + Math.sin(s * 3 + Math.PI / 2) * w * 0.34,
    y: h / 2 + Math.sin(s * 2) * h * 0.3,
  };
}

/** Radius that covers the whole stage from point (x, y). */
export function coverRadius(
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(w - x, y),
    Math.hypot(x, h - y),
    Math.hypot(w - x, h - y),
  );
}

export function easeInOut(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** Lens radius while expanding (k 0→1) from the base radius to the full cover. */
export function lensRadius(k: number, base: number, cover: number): number {
  return base + (cover - base) * easeInOut(k);
}

/** Tool chip slots on a ring around the core. */
export function chipSlots(n: number, w: number, h: number, mobile: boolean) {
  const rx = w * (mobile ? 0.32 : 0.34);
  const ry = h * (mobile ? 0.36 : 0.32);
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
    return { x: w / 2 + Math.cos(a) * rx, y: h / 2 + Math.sin(a) * ry };
  });
}
