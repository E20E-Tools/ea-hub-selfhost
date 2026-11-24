import { normalizeTerms, type TermsContent } from "./terms";
import {
  DEFAULT_ARCHY_GREETING,
  normalizeArchyGreeting,
  type ArchyGreetingSettings,
} from "./archy-settings";
import { productImages } from "./product-images";
import { hasLaunched } from "./archone-launch";
import { normalizeBeneficiaryDetails } from "./beneficiary-metadata";
import { products, type Product } from "./products";
import { pick, pickList, type Language } from "./language-core";
import {
  readNavigation,
  DEFAULT_NAVIGATION,
  type NavigationItem,
} from "./navigation.shared";
import { normalizeContactInfo, type ContactInfo } from "./contact-info";
import {
  normalizeDesignTheme,
  defaultDesignTheme,
  type DesignThemeSetting,
} from "./design-themes";
import {
  defaultFeatureFlags,
  normalizeFeatureFlags,
  type FeatureFlags,
} from "./site-features";
import { readFooterLinks, type FooterLink } from "./footer-links";
import {
  normalizeThemeCustomizations,
  themeCustomizationCss,
  type ThemeCustomizations,
} from "./theme-customization";

export type { Product } from "./products";
export { pick, pickList, type Language } from "./language-core";

export const ALL_CATEGORIES = "all";
export const ASSET_BUCKET = "library-assets";

export type SiteSettings = {
  navigationItems?: NavigationItem[];
  displayTitle: string;
  arabicTitle: string;
  description: string;
  footerText: string;
  footerLinks?: FooterLink[];
  logoUrl: string;
  logoPath: string;
  headingFont: string;
  bodyFont: string;
  categories: Record<string, string>;
  colors: Record<string, string>;
  /** English wording the admin can fill in; empty falls back to the Arabic field. */
  descriptionEn: string;
  categoriesEn: Record<string, string>;
  displayTitleEn: string;
  footerTextEn: string;
  tagline: string;
  taglineEn: string;
  navStyle: string;
  motionEnabled: boolean;
  motionSpeed: number;
  motionDirection: "normal" | "reverse" | "alternate";
  imageFit: "contain" | "cover";
  imageBrightness: number;
  imageContrast: number;
  imageSaturation: number;
  imageSharpen: boolean;
  mobileNavStyle: "sheet" | "dropdown" | "compact";
  /** Visitor-facing features the admin can switch off from the settings. */
  featureFlags: FeatureFlags;
  contactInfo: ContactInfo;
  /** Site-wide design theme chosen by an admin. */
  designTheme: DesignThemeSetting;
  /** Per-design colours, sizes and pictures (storage paths). */
  themeCustomizations: ThemeCustomizations;
  /** Signed URLs for the storage paths used by themeCustomizations. */
  themeAssetUrls: Record<string, string>;
  /** Terms of service text edited in design customisation. */
  terms: TermsContent;
  archyGreeting: ArchyGreetingSettings;
};

export type Catalog = { products: Product[]; settings: SiteSettings };

export const defaultSettings: SiteSettings = {
  navigationItems: DEFAULT_NAVIGATION,
  displayTitle: "E20E Tools.",
  arabicTitle: "",
  description: "Built by EA, for EA - All EA Tools In  1 Place",
  footerText: "Built with ♥ by TAQNIA.ME & DT.Guide",
  footerLinks: [
    { name: "TAQNIA.ME", url: "https://taqnia.me/" },
    { name: "DT.Guide", url: "https://dt.guide/" },
  ],
  logoUrl: "",
  logoPath: "",
  headingFont: "Alexandria",
  bodyFont: "Alexandria",
  categories: {
    architecture: "البنية المؤسسية",
    technology: "إدارة التقنيات",
    platform: "المنصات المتكاملة",
  },
  colors: {},
  descriptionEn: "Built by EA, for EA - All EA Tools In 1 Place",
  categoriesEn: {
    architecture: "Enterprise Architecture",
    technology: "Technology Management",
    platform: "Integrated Platforms",
  },
  displayTitleEn: "",
  footerTextEn: "",
  tagline: "EA Tools built by EA, for EA",
  taglineEn: "",
  navStyle: "glass",
  motionEnabled: true,
  motionSpeed: 1,
  motionDirection: "normal",
  imageFit: "contain",
  imageBrightness: 1,
  imageContrast: 1,
  imageSaturation: 1,
  imageSharpen: false,
  mobileNavStyle: "sheet",
  featureFlags: defaultFeatureFlags,
  contactInfo: normalizeContactInfo({}),
  designTheme: defaultDesignTheme,
  themeCustomizations: {},
  themeAssetUrls: {},
  terms: { ar: "", en: "", updatedAt: "" },
  archyGreeting: DEFAULT_ARCHY_GREETING,
};

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  label: string;
  description: string;
  overview: string;
  features: string[] | null;
  url: string;
  keywords: string;
  services_enabled?: boolean;
  coming_soon: boolean;
  publication_date?: string | null;
  image_url: string;
  image_alt: string;
  sort_order: number;
  version: string;
  whats_new: string;
  label_en?: string | null;
  description_en?: string | null;
  overview_en?: string | null;
  features_en?: string[] | null;
  image_alt_en?: string | null;
  whats_new_en?: string | null;
  github_url?: string | null;
  beneficiary_details?: unknown;
};

export type SettingsRow = {
  navigation_items?: unknown;
  display_title: string;
  arabic_title: string;
  description: string;
  logo_url: string;
  footer_text?: string;
  footer_links?: unknown;
  heading_font: string;
  body_font: string;
  categories: unknown;
  colors: unknown;
  description_en?: string | null;
  display_title_en?: string | null;
  footer_text_en?: string | null;
  categories_en?: unknown;
  tagline?: string | null;
  tagline_en?: string | null;
  nav_style?: string | null;
  motion_enabled?: boolean | null;
  motion_speed?: number | string | null;
  motion_direction?: string | null;
  image_fit?: string | null;
  image_brightness?: number | string | null;
  image_contrast?: number | string | null;
  image_saturation?: number | string | null;
  image_sharpen?: boolean | null;
  mobile_nav_style?: string | null;
  feature_flags?: unknown;
  contact_info?: unknown;
  design_theme?: unknown;
  theme_customizations?: unknown;
  terms_content?: unknown;
  archy_greeting?: unknown;
};

function stringMap(
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof entry === "string" &&
      entry.trim() !== "" &&
      /^[a-z0-9-]+$/i.test(key)
    )
      out[key] = entry.trim();
  }
  return Object.keys(out).length > 0 ? out : fallback;
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim() !== "")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function mapProduct(
  row: ProductRow,
  resolvedImage = "",
  now = Date.now(),
): Product {
  const bundled = productImages[row.id];
  // Display only: a coming-soon product whose launch moment has passed is shown as available.
  // The stored flag is kept in comingSoonSetting so the admin editor never rewrites it silently.
  const comingSoon =
    row.coming_soon && !hasLaunched(row.id, row.publication_date, now);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    label: row.label,
    description: row.description,
    overview: row.overview,
    features: textList(row.features),
    version: text(row.version),
    whatsNew: text(row.whats_new),
    url: row.url,
    keywords: row.keywords,
    servicesEnabled: row.services_enabled !== false,
    ...(comingSoon ? { comingSoon: true } : {}),
    ...(row.coming_soon ? { comingSoonSetting: true } : {}),
    publicationDate: text(row.publication_date),
    // Gallery image is the source of truth; bundled art is only for the offline fallback catalog.
    image: resolvedImage,
    imageAlt: row.image_alt || bundled?.alt || `صورة ${row.name}`,
    imagePath: row.image_url || "",
    sortOrder: row.sort_order,
    labelEn: text(row.label_en),
    descriptionEn: text(row.description_en),
    overviewEn: text(row.overview_en),
    featuresEn: textList(row.features_en),
    imageAltEn: text(row.image_alt_en),
    whatsNewEn: text(row.whats_new_en),
    githubUrl: text(row.github_url),
    beneficiaryDetails: normalizeBeneficiaryDetails(row.beneficiary_details),
  };
}

export function mapSettings(
  row: SettingsRow | null,
  resolvedLogo = "",
  themeAssetUrls: Record<string, string> = {},
): SiteSettings {
  if (!row) return defaultSettings;
  return {
    displayTitle: row.display_title || defaultSettings.displayTitle,
    navigationItems: readNavigation(row.navigation_items),
    arabicTitle: row.arabic_title || defaultSettings.arabicTitle,
    description: row.description || defaultSettings.description,
    footerText: row.footer_text || defaultSettings.footerText,
    footerLinks: readFooterLinks(row.footer_links),
    logoUrl: resolvedLogo || row.logo_url || "",
    logoPath: row.logo_url || "",
    headingFont: row.heading_font || defaultSettings.headingFont,
    bodyFont: row.body_font || defaultSettings.bodyFont,
    categories: stringMap(row.categories, defaultSettings.categories),
    colors: stringMap(row.colors, {}),
    descriptionEn: text(row.description_en) || defaultSettings.descriptionEn,
    categoriesEn: stringMap(row.categories_en, defaultSettings.categoriesEn),
    displayTitleEn: text(row.display_title_en),
    footerTextEn: text(row.footer_text_en),
    tagline: row.tagline == null ? defaultSettings.tagline : text(row.tagline),
    taglineEn: text(row.tagline_en),
    navStyle: text(row.nav_style) || defaultSettings.navStyle,
    motionEnabled: row.motion_enabled ?? true,
    motionSpeed: Math.min(3, Math.max(0.25, Number(row.motion_speed) || 1)),
    motionDirection:
      row.motion_direction === "reverse" || row.motion_direction === "alternate"
        ? row.motion_direction
        : "normal",
    imageFit: row.image_fit === "cover" ? "cover" : "contain",
    imageBrightness: ratio(row.image_brightness),
    imageContrast: ratio(row.image_contrast),
    imageSaturation: ratio(row.image_saturation),
    imageSharpen: row.image_sharpen ?? false,
    mobileNavStyle:
      row.mobile_nav_style === "dropdown" || row.mobile_nav_style === "compact"
        ? row.mobile_nav_style
        : "sheet",
    featureFlags: normalizeFeatureFlags(row.feature_flags),
    contactInfo: normalizeContactInfo(row.contact_info),
    designTheme: normalizeDesignTheme(row.design_theme),
    themeCustomizations: normalizeThemeCustomizations(row.theme_customizations),
    themeAssetUrls,
    terms: normalizeTerms(row.terms_content),
    archyGreeting: normalizeArchyGreeting(row.archy_greeting),
  };
}

function ratio(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(1.5, Math.max(0.5, n)) : 1;
}

/**
 * Returns the product with the wording for the visitor's language already chosen.
 * Rendering code asks for this once and then reads plain fields.
 */
export function localizedProduct(
  product: Product,
  language: Language,
): Product {
  return {
    ...product,
    label: pick(language, product.label, product.labelEn ?? ""),
    description: pick(
      language,
      product.description,
      product.descriptionEn ?? "",
    ),
    overview: pick(language, product.overview, product.overviewEn ?? ""),
    features: pickList(language, product.features, product.featuresEn ?? []),
    imageAlt: pick(language, product.imageAlt ?? "", product.imageAltEn ?? ""),
    whatsNew: pick(language, product.whatsNew ?? "", product.whatsNewEn ?? ""),
  };
}

/** Same rule for the organisation description and the category names. */
export function localizedSettings(
  settings: SiteSettings,
  language: Language,
): SiteSettings {
  return {
    ...settings,
    displayTitle: pick(
      language,
      settings.displayTitle,
      settings.displayTitleEn,
    ),
    footerText: pick(language, settings.footerText, settings.footerTextEn),
    tagline: pick(language, settings.tagline, settings.taglineEn),
    description: pick(language, settings.description, settings.descriptionEn),
    categories: Object.fromEntries(
      Object.entries(settings.categories).map(([id, label]) => [
        id,
        pick(language, label, settings.categoriesEn[id] ?? ""),
      ]),
    ),
  };
}

export type FilterChip = { id: string; label: string; count: number };

export function buildFilterChips(
  list: Product[],
  categories: Record<string, string>,
  language: Language = "ar",
): FilterChip[] {
  const counts = new Map<string, number>();
  for (const product of list)
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  const chips = [...counts.entries()].map(([id, count]) => ({
    id,
    label: categories[id] ?? id,
    count,
  }));
  chips.sort((a, b) =>
    a.label.localeCompare(b.label, language === "en" ? "en" : "ar"),
  );
  const allLabel = language === "en" ? "All products" : "كل المنتجات";
  return [
    { id: ALL_CATEGORIES, label: allLabel, count: list.length },
    ...chips,
  ];
}

/**
 * Search matches both languages whatever the visitor is reading, so an English
 * term still finds a product whose Arabic text never mentions it.
 */
export function filterCatalog(
  list: Product[],
  query: string,
  category: string,
): Product[] {
  const term = query.trim().toLocaleLowerCase();
  return list.filter(
    (product) =>
      (category === ALL_CATEGORIES || product.category === category) &&
      `${product.name} ${product.label} ${product.description} ${product.keywords} ${product.labelEn ?? ""} ${product.descriptionEn ?? ""}`
        .toLocaleLowerCase()
        .includes(term),
  );
}

export const fallbackCatalog: Catalog = {
  products: products.map((product, index) => ({
    ...product,
    image: productImages[product.id]?.src ?? "",
    imageAlt: productImages[product.id]?.alt ?? `صورة ${product.name}`,
    imagePath: "",
    sortOrder: (index + 1) * 10,
  })),
  settings: defaultSettings,
};

export type FontChoice = {
  id: string;
  label: string;
  weights: string;
  arabic: boolean;
};

export const bundledFonts = [
  "Geist",
  "Signifier",
  "IBM Plex Sans Arabic",
] as const;

export const fontChoices: FontChoice[] = [
  { id: "Geist", label: "Geist", weights: "400", arabic: false },
  { id: "Signifier", label: "Signifier", weights: "400", arabic: false },
  {
    id: "Alexandria",
    label: "Alexandria",
    weights: "300;400;500;700",
    arabic: true,
  },
  {
    id: "IBM Plex Sans Arabic",
    label: "IBM Plex Sans Arabic",
    weights: "300;400;500;700",
    arabic: true,
  },
  { id: "Tajawal", label: "Tajawal", weights: "300;400;500;700", arabic: true },
  { id: "Almarai", label: "Almarai", weights: "300;400;500;700", arabic: true },
  { id: "Cairo", label: "Cairo", weights: "300;400;500;700", arabic: true },
  {
    id: "Readex Pro",
    label: "Readex Pro",
    weights: "300;400;500;700",
    arabic: true,
  },
  {
    id: "Noto Kufi Arabic",
    label: "Noto Kufi Arabic",
    weights: "300;400;500;700",
    arabic: true,
  },
  {
    id: "Space Grotesk",
    label: "Space Grotesk",
    weights: "300;400;500;700",
    arabic: false,
  },
  { id: "Sora", label: "Sora", weights: "300;400;500;700", arabic: false },
  {
    id: "Manrope",
    label: "Manrope",
    weights: "300;400;500;700",
    arabic: false,
  },
];

export function isKnownFont(id: string): boolean {
  return fontChoices.some((font) => font.id === id);
}

export function fontsHref(heading: string, body: string): string {
  const ids = [
    ...new Set(
      [heading, body].filter(
        (id) =>
          isKnownFont(id) && !bundledFonts.some((bundled) => bundled === id),
      ),
    ),
  ];
  if (ids.length === 0) return "";
  const families = ids.map((id) => {
    const font = fontChoices.find((entry) => entry.id === id)!;
    return `family=${encodeURIComponent(id).replace(/%20/g, "+")}:wght@${font.weights}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

/** Keep a saved web font selectable on offline installations, even when the font file is unavailable. */
export function pickerFonts(local: boolean, saved: string): FontChoice[] {
  return fontChoices.filter(
    (font) =>
      !local ||
      font.id === defaultSettings.bodyFont ||
      font.id === saved ||
      bundledFonts.some((id) => id === font.id),
  );
}

export function siteFontStack(id: string): string {
  const head = isKnownFont(id) ? id : "Geist";
  return (
    [...new Set([head, "IBM Plex Sans Arabic", "Geist"])]
      .map((face) => `"${face}"`)
      .join(",") + ",Arial,sans-serif"
  );
}

export const colorTokens: { token: string; label: string }[] = [
  { token: "--background", label: "الخلفية" },
  { token: "--foreground", label: "النص" },
  { token: "--primary", label: "اللون الأساسي" },
  { token: "--primary-foreground", label: "نص فوق الأساسي" },
  { token: "--muted-foreground", label: "نص ثانوي" },
  { token: "--card", label: "البطاقات" },
  { token: "--accent", label: "التمييز" },
  { token: "--library-rule", label: "الحدود والفواصل" },
];

const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\([^)]{1,60}\)|oklch\([^)]{1,60}\)|hsla?\([^)]{1,60}\))$/i;

export function isValidColor(value: string): boolean {
  return SAFE_COLOR.test(value.trim());
}

export function themeCss(settings: SiteSettings): string {
  const heading = isKnownFont(settings.headingFont)
    ? settings.headingFont
    : defaultSettings.headingFont;
  const body = isKnownFont(settings.bodyFont)
    ? settings.bodyFont
    : defaultSettings.bodyFont;
  const colors = Object.entries(settings.colors)
    .filter(
      ([token, value]) => /^--[a-z0-9-]+$/i.test(token) && isValidColor(value),
    )
    .map(([token, value]) => `${token}:${value.trim()}`);
  const bodyOverride =
    body === defaultSettings.bodyFont ? "" : `--s-font:${siteFontStack(body)};`;
  const fonts = `--font-display:${siteFontStack(heading)};--font-sans:${siteFontStack(body)};${bodyOverride}`;
  const headingRule =
    heading === defaultSettings.headingFont
      ? ""
      : `:root:root:root [data-surface="site"] :is(h1,h2,h3,h4,h5,h6){font-family:${siteFontStack(heading)}}`;
  const designs = themeCustomizationCss(
    settings.themeCustomizations ?? {},
    settings.themeAssetUrls ?? {},
  );
  const studioPalette: Record<string, string> = {
    "--background": "--ea-paper",
    "--foreground": "--ea-ink",
    "--primary": "--ea-brand",
    "--primary-foreground": "--ea-on-brand",
    "--card": "--ea-surface",
    "--muted-foreground": "--ea-muted",
    "--accent": "--ea-wash",
    "--library-rule": "--ea-line",
  };
  const overrides = Object.entries(studioPalette).flatMap(
    ([source, target]) => {
      const value = settings.colors[source]?.trim();
      return value && isValidColor(value) ? [`${target}:${value}`] : [];
    },
  );
  const studio = overrides.length
    ? `[data-surface="site"]{${overrides.join(";")}}`
    : "";
  return `:root:root{${fonts}${colors.join(";")}}${designs}${studio}${headingRule}`;
}
