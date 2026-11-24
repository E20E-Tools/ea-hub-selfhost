/** Metro lines derived from live catalog categories. Browser-safe and tiny (also used by the homepage grid). */
export const METRO_PALETTE = [
  "oklch(0.58 0.21 26)", // red #E3242B
  "oklch(0.52 0.14 248)", // blue #0B6FB8
  "oklch(0.58 0.14 160)", // green #00985F
  "oklch(0.74 0.17 60)", // orange #F39200
  "oklch(0.52 0.18 310)", // purple #8E44AD
  "oklch(0.64 0.11 205)", // teal #00A0B0
  "oklch(0.84 0.17 92)", // yellow #F5C400
  "oklch(0.6 0.25 355)", // pink #E5007D
] as const;

export type MetroLineInfo = {
  category: string;
  color: string;
  badge: string;
  index: number;
};

/** Lines in order of first appearance; badge = first letter of the category id, or the line number on clashes. */
export function metroLines(
  products: Array<{ category: string }>,
): MetroLineInfo[] {
  const seen: string[] = [];
  for (const p of products)
    if (!seen.includes(p.category)) seen.push(p.category);
  const used = new Set<string>();
  return seen.slice(0, 8).map((category, index) => {
    const letter = (category.match(/[a-z]/i)?.[0] ?? "").toUpperCase();
    const badge = letter && !used.has(letter) ? letter : String(index + 1);
    used.add(badge);
    return {
      category,
      color: METRO_PALETTE[index % METRO_PALETTE.length] ?? METRO_PALETTE[0],
      badge,
      index,
    };
  });
}
