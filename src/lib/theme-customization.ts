/**
 * Per-design customisation (colours, sizes, logo, background, About picture,
 * product pictures, consultant team contact)
 * saved by admins in site_settings.theme_customizations. Browser-safe: the root
 * layout turns it into CSS, the admin edits it, the server validates it.
 */
import { z } from "zod";
import {
  DESIGN_THEME_IDS,
  isDesignThemeId,
  type DesignThemeId,
} from "./design-themes";

const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\([^)]{1,60}\)|oklch\([^)]{1,60}\)|hsla?\([^)]{1,60}\))$/i;

export function isSafeColor(value: string): boolean {
  return SAFE_COLOR.test(value.trim());
}

/** Colours an admin can change for one design. */
export const CUSTOM_COLOR_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--muted-foreground",
  "--card",
  "--accent",
  "--library-rule",
] as const;
export type CustomColorToken = (typeof CUSTOM_COLOR_TOKENS)[number];

/**
 * Size controls. logo/text/cards are scale factors (1 = the design's own size);
 * header is the space in pixels above and below the top bar.
 */
export const SIZE_LIMITS = {
  logo: { min: 0.5, max: 1.6, step: 0.05 },
  text: { min: 0.85, max: 1.3, step: 0.05 },
  cards: { min: 0.6, max: 1.4, step: 0.05 },
  header: { min: 0, max: 48, step: 2 },
} as const;
export type SizeKey = keyof typeof SIZE_LIMITS;
export const SIZE_KEYS = Object.keys(SIZE_LIMITS) as SizeKey[];

export type ThemeCustomization = {
  colors: Partial<Record<CustomColorToken, string>>;
  sizes: Partial<Record<SizeKey, number>>;
  /** Storage paths; empty means the design's own picture. */
  logo: string;
  background: string;
  /** Picture on the About page; empty means the platform's own About picture. */
  aboutImage?: string;
  productImages: Record<string, string>;
  /** Consultant team for this design; empty fields fall back to the public email. */
  consultants?: ConsultantContact;
};
export type ConsultantContact = { email?: string; whatsapp?: string };
export type ThemeCustomizations = Partial<
  Record<DesignThemeId, ThemeCustomization>
>;

export const emptyCustomization = (): ThemeCustomization => ({
  colors: {},
  sizes: {},
  logo: "",
  background: "",
  aboutImage: "",
  productImages: {},
});

const ASSET_PATH = /^(branding|products|affiliates)\/[\w.-]{1,200}$/;
const assetPath = z
  .string()
  .trim()
  .max(240)
  .refine((v) => v === "" || ASSET_PATH.test(v), "مسار الصورة غير صالح.");

const EMAIL = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]+\.[a-z]{2,24}$/i;
export const isConsultantEmail = (v: string) =>
  EMAIL.test(v.trim()) && v.trim().length <= 160;
/** International number, digits only (country code first, no + or leading zeros). */
export const isWhatsappNumber = (v: string) => /^[1-9]\d{7,14}$/.test(v);
/** Turns what an admin types (+966 5x…, 00966…) into the stored digits-only form. */
export function normalizeWhatsapp(value: string): string {
  return value.replace(/\D/g, "").replace(/^00/, "");
}
export function whatsappUrl(digits: string): string {
  return isWhatsappNumber(digits) ? `https://wa.me/${digits}` : "";
}

const sizeValue = (key: SizeKey) =>
  z
    .number()
    .finite()
    .min(SIZE_LIMITS[key].min)
    .max(SIZE_LIMITS[key].max)
    .optional();

export const themeCustomizationSchema = z.object({
  colors: z
    .record(
      z
        .string()
        .refine(
          (k) => (CUSTOM_COLOR_TOKENS as readonly string[]).includes(k),
          "لون غير معروف.",
        ),
      z.string().trim().max(80).refine(isSafeColor, "قيمة اللون غير صحيحة."),
    )
    .default({}),
  sizes: z
    .object({
      logo: sizeValue("logo"),
      text: sizeValue("text"),
      cards: sizeValue("cards"),
      header: sizeValue("header"),
    })
    .strict()
    .default({}),
  logo: assetPath.default(""),
  background: assetPath.default(""),
  aboutImage: assetPath.default(""),
  productImages: z
    .record(
      z.string().regex(/^[a-z0-9-]{1,60}$/i, "معرّف المنتج غير صالح."),
      assetPath,
    )
    .refine((v) => Object.keys(v).length <= 40, "عدد الصور كبير جدًا.")
    .default({}),
  consultants: z
    .object({
      email: z
        .string()
        .trim()
        .max(160)
        .refine((v) => v === "" || isConsultantEmail(v), "البريد غير صالح.")
        .default(""),
      whatsapp: z
        .string()
        .trim()
        .max(20)
        .refine((v) => v === "" || isWhatsappNumber(v), "رقم واتساب غير صالح.")
        .default(""),
    })
    .strict()
    .optional(),
});

export const saveThemeCustomizationSchema = z.object({
  theme: z.enum(DESIGN_THEME_IDS),
  value: themeCustomizationSchema,
});

/** Drops empty values so "back to the design default" removes the key entirely. */
export function compactCustomization(
  value: ThemeCustomization,
): ThemeCustomization {
  const colors = Object.fromEntries(
    Object.entries(value.colors).filter(
      ([, v]) => typeof v === "string" && v.trim() !== "",
    ),
  ) as ThemeCustomization["colors"];
  const sizes = Object.fromEntries(
    Object.entries(value.sizes).filter(
      ([, v]) => typeof v === "number" && Number.isFinite(v),
    ),
  ) as ThemeCustomization["sizes"];
  const productImages = Object.fromEntries(
    Object.entries(value.productImages).filter(([, v]) => v !== ""),
  );
  const out: ThemeCustomization = {
    colors,
    sizes,
    logo: value.logo,
    background: value.background,
    productImages,
  };
  if (value.aboutImage) out.aboutImage = value.aboutImage;
  const email = value.consultants?.email?.trim() ?? "";
  const whatsapp = value.consultants?.whatsapp?.trim() ?? "";
  if (email || whatsapp)
    out.consultants = {
      ...(email ? { email } : {}),
      ...(whatsapp ? { whatsapp } : {}),
    };
  return out;
}

export function isEmptyCustomization(
  value: ThemeCustomization | undefined,
): boolean {
  if (!value) return true;
  const c = compactCustomization(value);
  return (
    Object.keys(c.colors).length === 0 &&
    Object.keys(c.sizes).length === 0 &&
    !c.logo &&
    !c.background &&
    !c.aboutImage &&
    !c.consultants &&
    Object.keys(c.productImages).length === 0
  );
}

/** Reads the saved column; invalid designs or entries are ignored, never fatal. */
export function normalizeThemeCustomizations(
  raw: unknown,
): ThemeCustomizations {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ThemeCustomizations = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDesignThemeId(id)) continue;
    const parsed = themeCustomizationSchema.safeParse(entry);
    if (!parsed.success) continue;
    const value = compactCustomization(parsed.data as ThemeCustomization);
    if (!isEmptyCustomization(value)) out[id] = value;
  }
  return out;
}

/**
 * Contact for the consultant team of one design: its own email/WhatsApp when set,
 * otherwise the site's public email so the page is never a dead end.
 */
export function consultantContact(
  entry: ThemeCustomization | undefined,
  publicEmail: string,
): { email: string; whatsapp: string; own: boolean } {
  const email = entry?.consultants?.email ?? "";
  const whatsapp = entry?.consultants?.whatsapp ?? "";
  const own = Boolean(email || whatsapp);
  return { email: own ? email : publicEmail, whatsapp, own };
}

/** Every storage path the saved customisations reference (for signing). */
export function customizationPaths(map: ThemeCustomizations): string[] {
  const paths = new Set<string>();
  for (const entry of Object.values(map)) {
    if (!entry) continue;
    if (entry.logo) paths.add(entry.logo);
    if (entry.background) paths.add(entry.background);
    if (entry.aboutImage) paths.add(entry.aboutImage);
    for (const p of Object.values(entry.productImages)) if (p) paths.add(p);
  }
  return [...paths];
}

const SAFE_CSS_URL = /^(https:\/\/|\/)[^\s"'()\\<>]+$/;

function clamp(key: SizeKey, value: number): number {
  const { min, max } = SIZE_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Card width relative to the design's own. Wide screens keep three columns and
 * narrow the grid for smaller cards, or switch to two columns for larger ones;
 * the phone swipe row scales its card width instead.
 */
function cardRules(site: string, scale: number): string[] {
  const columns = scale > 1 ? 2 : 3;
  // Each card is (grid width / columns); the design's own card is a third of the row.
  const width = (scale * 100 * columns) / 3;
  return [
    `@media (min-width:761px){${site} .product-grid{grid-template-columns:repeat(${columns},minmax(0,1fr));max-width:${round(Math.min(100, width))}%;margin-inline:auto}}`,
    `@media (max-width:760px){${site} .product-grid{grid-auto-columns:minmax(min(${round(232 * scale)}px,88vw),min(${round(76 * scale)}vw,88vw))}}`,
  ];
}

/**
 * CSS for every customised design. Selectors are scoped to the design and outrank
 * the design's own stylesheet; layout rules only touch the visitor surface so the
 * admin stays legible. `[data-theme-defaults]` lets the admin read the design's
 * own colours without the saved overrides.
 */
export function themeCustomizationCss(
  map: ThemeCustomizations,
  urls: Readonly<Record<string, string>>,
): string {
  const rules: string[] = [];
  for (const [id, entry] of Object.entries(map) as [
    DesignThemeId,
    ThemeCustomization,
  ][]) {
    if (!isDesignThemeId(id) || !entry) continue;
    const root = `:root:root:root[data-design-theme="${id}"]:not([data-theme-defaults])`;
    const site = `${root} [data-surface="site"]`;
    const colors = Object.entries(entry.colors)
      .filter(
        ([token, value]) =>
          (CUSTOM_COLOR_TOKENS as readonly string[]).includes(token) &&
          typeof value === "string" &&
          isSafeColor(value),
      )
      .map(([token, value]) => `${token}:${(value as string).trim()}`);
    if (colors.length > 0) rules.push(`${root}{${colors.join(";")}}`);
    const { logo, text, cards, header } = entry.sizes;
    if (typeof logo === "number")
      rules.push(`${site} .site-brand{zoom:${clamp("logo", logo)}}`);
    if (typeof header === "number")
      rules.push(
        `${site} .site-header{padding-block:${clamp("header", header)}px}`,
      );
    if (typeof cards === "number")
      rules.push(...cardRules(site, clamp("cards", cards)));
    if (typeof text === "number")
      rules.push(
        `${site} :is(.site-content,.site-footer){zoom:${clamp("text", text)}}`,
      );
    const bg = entry.background ? (urls[entry.background] ?? "") : "";
    if (bg && SAFE_CSS_URL.test(bg)) {
      const veil = "color-mix(in oklab,var(--background) 72%,transparent)";
      rules.push(
        `${site}{background-color:var(--background);background-image:linear-gradient(${veil},${veil}),url("${bg}");background-size:cover;background-position:center;background-repeat:no-repeat;background-attachment:fixed}`,
      );
    }
  }
  return rules.join("");
}
