/** Split-flap units: Latin/digits flip per character; Arabic flips whole words to keep letters joined. */
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasArabic(text: string): boolean {
  return ARABIC.test(text);
}

export function splitFlapUnits(text: string): string[] {
  if (hasArabic(text)) return text.split(/(\s+)/).filter((u) => u.length > 0);
  return Array.from(text);
}

const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Deterministic in-between glyph for a flipping cell (no Math.random during render). */
export function flapGlyph(seed: number, pool: string[]): string {
  if (pool.length) return pool[Math.abs(seed * 7919) % pool.length] ?? "";
  return LATIN[Math.abs(seed * 31) % LATIN.length] ?? "A";
}
