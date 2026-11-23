/** Visitor-facing site features an admin can switch on or off from the settings. */
export const FEATURE_KEYS = [
  "assistant",
  "recommendations",
  "support",
  "affiliates",
  "roadmap",
  "blog",
  "enterprise",
  "testimonials",
  "terms",
  "contact",
  "arabic",
  "discover",
  "compare",
  "myTools",
  "trials",
  "waitlist",
  "newsletter",
  "search",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Switches that existed before the 2026-11 additions; settings saved earlier always carry these. */
export const LEGACY_FEATURE_KEYS: readonly FeatureKey[] = FEATURE_KEYS.slice(0, 11);

export const FEATURE_LABELS: Record<FeatureKey, { ar: string; en: string }> = {
  assistant: { ar: "المساعد الذكي أرشي", en: "Archy smart assistant" },
  recommendations: { ar: "اقتراحات الأدوات في الطلبات", en: "Tool recommendations" },
  support: { ar: "صفحة ادعمنا", en: "Support us page" },
  affiliates: { ar: "صفحة التوابع", en: "Affiliates page" },
  roadmap: { ar: "خارطة التقنيات", en: "Technology roadmap" },
  blog: { ar: "صفحة من نحن", en: "About us page" },
  enterprise: { ar: "الخدمات المؤسسية", en: "Enterprise services" },
  testimonials: { ar: "شهادات العملاء", en: "Client testimonials" },
  terms: { ar: "شروط الخدمة", en: "Terms of service" },
  contact: { ar: "صفحة اتصل بنا", en: "Contact us page" },
  arabic: { ar: "اللغة العربية للزوار", en: "Arabic for visitors" },
  discover: { ar: "ابدأ باحتياجك", en: "Start with your need" },
  compare: { ar: "مقارنة الأدوات", en: "Tool comparison" },
  myTools: { ar: "أدواتي المحفوظة", en: "Saved tools" },
  trials: { ar: "تمارين التخطيط", en: "Planning exercises" },
  waitlist: { ar: "قائمة انتظار الأدوات القادمة", en: "Coming-soon waitlist" },
  newsletter: { ar: "الاشتراك في النشرة", en: "Newsletter sign-up" },
  search: { ar: "البحث في الموقع", en: "Site search" },
};

/** Public pages a feature toggle controls; a disabled feature hides its menu link too. */
export const FEATURE_PATHS: Partial<Record<FeatureKey, string>> = {
  support: "/support",
  affiliates: "/affiliates",
  roadmap: "/technology-roadmap",
  blog: "/about",
  enterprise: "/enterprise-services",
  testimonials: "/testimonials",
  terms: "/terms",
  contact: "/contact",
  discover: "/discover",
  compare: "/compare",
  myTools: "/my-tools",
  trials: "/try",
  newsletter: "/newsletter",
};

export type FeatureFlags = Record<FeatureKey, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
  assistant: true,
  recommendations: true,
  support: true,
  affiliates: true,
  roadmap: true,
  blog: true,
  enterprise: true,
  testimonials: true,
  terms: true,
  contact: true,
  arabic: true,
  discover: true,
  compare: true,
  myTools: true,
  trials: true,
  waitlist: true,
  newsletter: true,
  search: true,
};

/** Unknown or missing keys fall back to enabled; only an explicit false turns a feature off. */
export function normalizeFeatureFlags(value: unknown): FeatureFlags {
  const out = { ...defaultFeatureFlags };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of FEATURE_KEYS) {
      const entry = (value as Record<string, unknown>)[key];
      if (typeof entry === "boolean") out[key] = entry;
    }
  }
  return out;
}

export function featureEnabled(flags: FeatureFlags | undefined, key: FeatureKey): boolean {
  return flags ? flags[key] !== false : true;
}

/** A missing/malformed authoritative settings value is unknown, never an enabled fallback. */
export function authoritativeFeatureState(value: unknown, key: FeatureKey): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return normalizeFeatureFlags(value)[key];
}

const LEGACY_ABOUT_PATH = "/blog";

/** True when a menu link points into a feature the admin switched off. */
export function isDisabledFeaturePath(flags: FeatureFlags | undefined, url: string): boolean {
  if (!url.startsWith("/")) return false;
  const raw = url.split("?")[0] || "/";
  // The former About address still belongs to the About page switch.
  const path = raw === LEGACY_ABOUT_PATH ? "/about" : raw;
  for (const [key, featurePath] of Object.entries(FEATURE_PATHS) as [FeatureKey, string][]) {
    if (path === featurePath || path.startsWith(`${featurePath}/`))
      return !featureEnabled(flags, key);
  }
  return false;
}
