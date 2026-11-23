/** Pure helpers for "Flip Deck" (browser-safe). Timeline: stacked → fan → flips → gentle wave. */
export const STACK_MS = 600;
export const FAN_MS = 900;
export const FLIP_GAP_MS = 380;
export const FLIP_MS = 700;

export function easeOut(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return 1 - Math.pow(1 - c, 3);
}

/** Fan pose for card i of n at fan progress k (0 = stacked, 1 = spread). */
export function fanPose(i: number, n: number, k: number, width: number) {
  const mid = (n - 1) / 2;
  const off = n <= 1 ? 0 : i - mid;
  const e = easeOut(k);
  const spread = Math.min(170, (width * 0.82) / Math.max(1, n));
  return {
    x: off * spread * e,
    y: Math.abs(off) * 10 * e - (1 - e) * i * 2,
    rotate: off * 5 * e,
  };
}

/** Flip angle (0 = back shown, 180 = tool shown) for card i at time ms. */
export function flipAngle(i: number, ms: number): number {
  const start = STACK_MS + FAN_MS + i * FLIP_GAP_MS;
  return 180 * easeOut((ms - start) / FLIP_MS);
}

/** Time when every card has flipped. */
export function deckSettledAt(n: number): number {
  return STACK_MS + FAN_MS + Math.max(0, n - 1) * FLIP_GAP_MS + FLIP_MS;
}

/** Gentle ripple after settling (px). */
export function wave(i: number, ms: number, settled: number, amp = 6): number {
  if (ms < settled) return 0;
  return Math.sin((ms - settled) * 0.002 - i * 0.7) * amp;
}

/** Stable hue-ish accent per product, from the brand palette. */
export const ACCENTS = ["#2F6BFF", "#00D4FF", "#8B5CF6"] as const;
export function accentFor(i: number): string {
  return ACCENTS[i % ACCENTS.length]!;
}
