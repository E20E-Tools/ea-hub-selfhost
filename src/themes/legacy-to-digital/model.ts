/** Pure helpers for the Legacy → Digital stage (browser-safe, deterministic). */

/** Owner-editable joke filenames per product id. Unknown products fall back to `<Name>_FINAL_v2.xlsx`. */
export const LEGACY_FILENAMES: Record<string, string> = {
  landscape: "Apps_inventory_FINAL_v7.xlsx",
  radar: "Tech_review_notes_OLD.docx",
  archone: "EA_diagrams_2017.vsd",
  itfm: "IT_budget_2019_copy(2).xls",
  innovation: "Ideas_email_thread.msg",
  platform: "\\\\shared-drive\\EA\\misc\\",
};

/** Decorative 90s desktop icons on the legacy side (owner-editable jokes; not products). */
export const LEGACY_DESKTOP_FILES: readonly string[] = [
  "Copy of Strategy (3).ppt",
  "Org_chart_1998.bmp",
  "Backup_of_backup.zip",
  "README_old.txt",
  "Roadmap_DRAFT_v12.doc",
];

export function legacyFileName(product: { id: string; name: string }): string {
  const known = LEGACY_FILENAMES[product.id];
  if (known) return known;
  const base =
    product.name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "") || "Untitled";
  return `${base}_FINAL_v2.xlsx`;
}

export function legacyKind(
  name: string,
): "sheet" | "doc" | "diagram" | "mail" | "folder" {
  if (name.endsWith("\\")) return "folder";
  if (/\.xlsx?$/.test(name)) return "sheet";
  if (/\.docx?$/.test(name)) return "doc";
  if (/\.(vsdx?|pptx?|bmp)$/.test(name)) return "diagram";
  if (/\.(txt|zip)$/.test(name)) return "doc";
  return "mail";
}

/**
 * Keyboard behaviour of the transformation handle. `value` is the digital share (0–100).
 * Keys that move the handle toward the reading-start side reveal more digital (+);
 * vertical (phone) layout: ArrowUp reveals more digital. Home = 0, End = 100.
 */
export function sliderKey(
  value: number,
  key: string,
  opts: { rtl: boolean; vertical: boolean; step?: number },
): number | null {
  const step = opts.step ?? 5;
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  const towardStart = opts.vertical
    ? "ArrowUp"
    : opts.rtl
      ? "ArrowRight"
      : "ArrowLeft";
  const towardEnd = opts.vertical
    ? "ArrowDown"
    : opts.rtl
      ? "ArrowLeft"
      : "ArrowRight";
  switch (key) {
    case towardStart:
      return clamp(value + step);
    case towardEnd:
      return clamp(value - step);
    case "ArrowUp":
      return clamp(value + step);
    case "ArrowDown":
      return clamp(value - step);
    case "PageUp":
      return clamp(value + 20);
    case "PageDown":
      return clamp(value - 20);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

export type Pt = [number, number];
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Interpolates two control-point lists of equal length (t clamped to 0..1). */
export function lerpPoints(a: Pt[], b: Pt[], t: number): Pt[] {
  if (a.length !== b.length)
    throw new Error("lerpPoints needs equal point counts");
  const k = Math.max(0, Math.min(1, t));
  return a.map(
    (p, i) => [lerp(p[0], b[i]![0], k), lerp(p[1], b[i]![1], k)] as Pt,
  );
}
/** Cubic Bézier chain through 1 + 3k points: M p0 C p1 p2 p3 C … */
export function cubicPath(points: Pt[]): string {
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
  for (let i = 1; i + 2 < points.length; i += 3) {
    d += `C${[points[i]!, points[i + 1]!, points[i + 2]!].map(([x, y]) => `${f(x)} ${f(y)}`).join(" ")}`;
  }
  return d;
}

export type HubBox = { x: number; y: number; halfW: number; halfH: number };
/**
 * Clean digital link from a card edge into the E20E hub. Cards in line with the hub run straight into its
 * facing edge; the rest bend onto the backbone and enter the hub's side. Returns 4 cubic control points.
 */
export function hubLink(start: Pt, hub: HubBox, vertical: boolean): Pt[] {
  const [x, y] = start;
  if (vertical) {
    if (Math.abs(y - hub.y) < hub.halfH) {
      const ex = hub.x + (x < hub.x ? -hub.halfW : hub.halfW);
      return [
        [x, y],
        [lerp(x, ex, 1 / 3), y],
        [lerp(x, ex, 2 / 3), y],
        [ex, y],
      ];
    }
    return [
      [x, y],
      [hub.x, y],
      [hub.x, y],
      [hub.x, hub.y + (y < hub.y ? -hub.halfH : hub.halfH)],
    ];
  }
  if (Math.abs(x - hub.x) < hub.halfW) {
    const ey = hub.y + (y < hub.y ? -hub.halfH : hub.halfH);
    return [
      [x, y],
      [x, lerp(y, ey, 1 / 3)],
      [x, lerp(y, ey, 2 / 3)],
      [x, ey],
    ];
  }
  return [
    [x, y],
    [x, hub.y],
    [x, hub.y],
    [hub.x + (x < hub.x ? -hub.halfW : hub.halfW), hub.y],
  ];
}

/** How "transformed" an item at position `u` (0 = reading start) is for a handle at `h`; a soft band around the handle. */
export function morphAt(u: number, h: number, band = 0.07): number {
  return Math.max(0, Math.min(1, (u - h) / (2 * band) + 0.5));
}

/** Hub position along the split axis; on phones it sits inside the default digital share, clear of the handle. */
export function hubU(vertical: boolean): number {
  return vertical ? 0.6 : 0.5;
}

export type L2DItem = { u: number; c: number };
/** Item positions along the split axis (u, from reading start/top) and the cross axis (c). Same for both worlds. */
export function l2dLayout(count: number, vertical: boolean): L2DItem[] {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  if (vertical) {
    // Rows pack above and below the centred hub (never beside it), so cards don't cover the E20E box.
    const rows = Math.ceil(n / 2);
    const top = Math.ceil(rows / 2);
    const bottom = rows - top;
    const hu = hubU(true);
    const gap = 0.14;
    const pitch = Math.min(
      0.15,
      (hu - gap - 0.08) / Math.max(top - 1, 1),
      (0.92 - hu - gap) / Math.max(bottom - 1, 1),
    );
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / 2);
      const u =
        row < top
          ? hu - gap - (top - 1 - row) * pitch
          : hu + gap + (row - top) * pitch;
      return { u, c: i % 2 === 0 ? 0.25 : 0.75 };
    });
  }
  const cols = Math.ceil(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const col = Math.floor(i / 2);
    let u = 0.08 + (0.84 * (col + 0.5)) / Math.max(cols, 1);
    if (cols % 2 === 1 && col === (cols - 1) / 2) u += 0; // centre column straddles the hub vertically
    // Rows sit close to the hub so the stage has no empty band above them.
    return { u, c: i % 2 === 0 ? 0.24 : 0.8 };
  });
}

/** Deterministic tangle offsets for a legacy cable (seeded by index). */
export function tangle(seed: number): number[] {
  let x = Math.sin(seed * 9301 + 49297) * 233280;
  return Array.from({ length: 6 }, () => {
    x = Math.sin(x) * 10000;
    return x - Math.floor(x) - 0.5;
  });
}
