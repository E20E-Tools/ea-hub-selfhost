/** Site-wide design themes. Browser-safe; shared by root layout, admin picker and server validation. */
export const DESIGN_THEME_IDS = [
  "classic",
  "circuit-core",
  "e20e-os",
  "transformation-metro",
  "e20e-galaxy",
  "digital-mashrabiya",
  "legacy-to-digital",
  "living-blueprint",
  "ea-metropolis",
  "transformation-board",
  "untangle-chaos",
  "reveal-lens",
  "problem-to-tool",
  "particle-forge",
  "flip-deck",
  "ea-layers",
] as const;

export type DesignThemeId = (typeof DESIGN_THEME_IDS)[number];
export type AnimationIntensity = "low" | "medium" | "high";

export type DesignThemeSetting = {
  theme: DesignThemeId;
  animations: boolean;
  intensity: AnimationIntensity;
};

export const defaultDesignTheme: DesignThemeSetting = {
  theme: "classic",
  animations: true,
  intensity: "medium",
};

export type DesignThemeMeta = {
  id: DesignThemeId;
  name: { en: string; ar: string };
  /** One-line idea shown in the admin picker. */
  description: { en: string; ar: string };
  dark: boolean;
};

export const DESIGN_THEMES: DesignThemeMeta[] = [
  {
    id: "classic",
    name: { en: "Classic", ar: "كلاسيكي" },
    description: { en: "The original warm paper look.", ar: "المظهر الأصلي بلون الورق الدافئ." },
    dark: false,
  },
  {
    id: "circuit-core",
    name: { en: "Circuit Core", ar: "اللوحة الأم" },
    description: {
      en: "The E20E suite as a motherboard wired to one core chip.",
      ar: "منظومة E20E كلوحة أم تتفرع أدواتها من شريحة مركزية.",
    },
    dark: true,
  },
  {
    id: "e20e-os",
    name: { en: "E20E OS", ar: "نظام تشغيل المؤسسة" },
    description: {
      en: "The site as an enterprise operating system: every tool is an app.",
      ar: "الموقع كنظام تشغيل للمؤسسة: كل أداة تطبيق على سطح المكتب.",
    },
    dark: true,
  },
  {
    id: "transformation-metro",
    name: { en: "Transformation Metro", ar: "مترو التحول" },
    description: {
      en: "Digital transformation as a transit map: every category a line, every tool a station.",
      ar: "التحول الرقمي كخريطة مترو: كل تصنيف خط وكل أداة محطة.",
    },
    dark: false,
  },
  {
    id: "e20e-galaxy",
    name: { en: "E20E Galaxy", ar: "مجرة E20E" },
    description: {
      en: "E20E as the sun of a solar system: every tool is a planet in orbit.",
      ar: "E20E شمس منظومة شمسية: كل أداة كوكب في مداره.",
    },
    dark: true,
  },
  {
    id: "digital-mashrabiya",
    name: { en: "Digital Mashrabiya", ar: "المشربية الرقمية" },
    description: {
      en: "Islamic geometry whose lines are circuits carrying light to every tool.",
      ar: "هندسة إسلامية تتحول خطوطها إلى دوائر تحمل الضوء إلى كل أداة.",
    },
    dark: true,
  },
  {
    id: "legacy-to-digital",
    name: { en: "Legacy → Digital", ar: "من الإرث إلى الرقمي" },
    description: {
      en: "Drag the handle and watch a 1990s IT office transform into a connected platform.",
      ar: "اسحب المقبض لترى مكتب تقنية التسعينات يتحول إلى منصة رقمية مترابطة.",
    },
    dark: false,
  },
  {
    id: "living-blueprint",
    name: { en: "Living Blueprint", ar: "المخطط الحي" },
    description: {
      en: "An architect's floor plan that draws itself: every tool is a room off the E20E atrium.",
      ar: "مخطط معماري يرسم نفسه أمامك: كل أداة غرفة متصلة ببهو E20E.",
    },
    dark: false,
  },
  {
    id: "ea-metropolis",
    name: { en: "EA Metropolis", ar: "مدينة البنية المؤسسية" },
    description: {
      en: "An isometric smart city on stacked architecture layers, where every tool is a building.",
      ar: "مدينة ذكية متساوية القياس فوق طبقات البنية المؤسسية، وكل أداة فيها مبنى.",
    },
    dark: true,
  },
  {
    id: "transformation-board",
    name: { en: "Transformation Board", ar: "لوحة التحول" },
    description: {
      en: "One circuit board: drag the handle and tangled legacy cables become clean traces into the E20E core.",
      ar: "لوحة دوائر واحدة: اسحب المقبض لتتحول الكابلات القديمة المتشابكة إلى مسارات نظيفة نحو نواة E20E.",
    },
    dark: false,
  },
  {
    id: "untangle-chaos",
    name: { en: "Untangle the Chaos", ar: "رتّب الفوضى" },
    description: {
      en: "Archy's drone scans each tangled legacy file and turns it into a tool wired cleanly to the E20E core.",
      ar: "درون أرشي يمسح كل ملف قديم متشابك ويحوّله إلى أداة متصلة بمسار نظيف نحو نواة E20E.",
    },
    dark: false,
  },
  {
    id: "reveal-lens",
    name: { en: "Reveal Lens", ar: "عدسة الكشف" },
    description: {
      en: "A magnifying lens over the legacy office reveals the clean digital world underneath.",
      ar: "عدسة مكبّرة فوق المكتب القديم تكشف العالم الرقمي النظيف تحته.",
    },
    dark: false,
  },
  {
    id: "problem-to-tool",
    name: { en: "Problem to Tool", ar: "من المشكلة إلى الأداة" },
    description: {
      en: "A search bar types real problems and the matching tool rises to answer; visitors can type their own.",
      ar: "شريط بحث يكتب مشكلات حقيقية فترتفع الأداة المناسبة، ويستطيع الزائر كتابة مشكلته.",
    },
    dark: false,
  },
  {
    id: "particle-forge",
    name: { en: "Particle Forge", ar: "جسيمات تتشكّل" },
    description: {
      en: "Hundreds of particles reshape from an old spreadsheet into tool clusters and the site title.",
      ar: "مئات الجسيمات تتحول من جدول قديم إلى تجمعات الأدوات ثم إلى عنوان الموقع.",
    },
    dark: true,
  },
  {
    id: "flip-deck",
    name: { en: "Flip Deck", ar: "بطاقات تنقلب" },
    description: {
      en: "A stack of legacy files fans out and flips, card by card, to reveal each replacement tool.",
      ar: "رزمة ملفات قديمة تنفرد كمروحة ثم تنقلب بطاقة بعد أخرى لتكشف الأداة البديلة.",
    },
    dark: false,
  },
  {
    id: "ea-layers",
    name: { en: "EA Layers", ar: "طبقات البنية المؤسسية" },
    description: {
      en: "Four isometric architecture layers breathe apart, each tool sitting on the layer it serves.",
      ar: "أربع طبقات متساوية القياس للبنية المؤسسية تتباعد وتعود، وكل أداة على الطبقة التي تخدمها.",
    },
    dark: false,
  },
];

export function themeMeta(id: DesignThemeId): DesignThemeMeta {
  const meta = DESIGN_THEMES.find((t) => t.id === id) ?? DESIGN_THEMES[0];
  if (!meta) throw new Error("Design theme catalog is empty");
  return meta;
}

export function isDesignThemeId(v: unknown): v is DesignThemeId {
  return typeof v === "string" && (DESIGN_THEME_IDS as readonly string[]).includes(v);
}

/** Unknown or retired values fall back to Classic with animations on at medium intensity. */
export function normalizeDesignTheme(value: unknown): DesignThemeSetting {
  const src =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    theme: isDesignThemeId(src["theme"]) ? src["theme"] : "classic",
    animations: typeof src["animations"] === "boolean" ? src["animations"] : true,
    intensity:
      src["intensity"] === "low" || src["intensity"] === "high" ? src["intensity"] : "medium",
  };
}

/** Element budget / speed multiplier per intensity level. */
export const INTENSITY_SCALE: Record<AnimationIntensity, number> = {
  low: 0.5,
  medium: 1,
  high: 1.6,
};

/** Google Fonts families (with weights) used by the experience themes. */
const FONT_FAMILIES = {
  Handjet: "Handjet:wght@400;600;800",
  "IBM Plex Mono": "IBM+Plex+Mono:wght@400;600",
  "IBM Plex Sans Arabic": "IBM+Plex+Sans+Arabic:wght@400;500;700",
  Sora: "Sora:wght@400;600;700",
  "JetBrains Mono": "JetBrains+Mono:wght@400;600",
  "Readex Pro": "Readex+Pro:wght@400;600;700",
  VT323: "VT323",
  "Architects Daughter": "Architects+Daughter",
  "Aref Ruqaa": "Aref+Ruqaa:wght@400;700",
  "Reem Kufi": "Reem+Kufi:wght@400;600;700",
  Orbitron: "Orbitron:wght@500;700",
  "Space Grotesk": "Space+Grotesk:wght@400;500;700",
  Tajawal: "Tajawal:wght@400;700",
} as const;
export type ThemeFontFamily = keyof typeof FONT_FAMILIES;

/** Fonts each design actually uses; Classic uses only the site fonts, so it loads nothing extra. */
export const THEME_FONT_FAMILIES: Record<DesignThemeId, readonly ThemeFontFamily[]> = {
  classic: [],
  "circuit-core": ["Handjet", "IBM Plex Mono", "IBM Plex Sans Arabic"],
  "e20e-os": ["Sora", "IBM Plex Sans Arabic", "JetBrains Mono"],
  "transformation-metro": ["Readex Pro", "IBM Plex Sans Arabic"],
  "e20e-galaxy": ["Orbitron", "Space Grotesk", "IBM Plex Sans Arabic", "Tajawal"],
  "digital-mashrabiya": ["Reem Kufi", "IBM Plex Sans Arabic"],
  "legacy-to-digital": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "living-blueprint": [
    "IBM Plex Mono",
    "Architects Daughter",
    "Aref Ruqaa",
    "IBM Plex Sans Arabic",
  ],
  "ea-metropolis": ["Space Grotesk", "IBM Plex Mono"],
  "transformation-board": ["Sora", "IBM Plex Sans Arabic", "IBM Plex Mono", "VT323"],
  "untangle-chaos": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "reveal-lens": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "problem-to-tool": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "particle-forge": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "flip-deck": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
  "ea-layers": ["Sora", "IBM Plex Sans Arabic", "VT323", "IBM Plex Mono"],
};

function fontsHrefFor(families: readonly ThemeFontFamily[]): string {
  const unique = [...new Set(families)];
  if (unique.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${unique.map((f) => `family=${FONT_FAMILIES[f]}`).join("&")}&display=swap`;
}

/** Stylesheet for one design's fonts; empty for Classic so nothing extra is downloaded. */
export function themeFontsHref(id: DesignThemeId): string {
  return fontsHrefFor(THEME_FONT_FAMILIES[id] ?? []);
}

/** Every design's fonts; loaded only while the admin design chooser is open. */
export const THEME_FONTS_HREF = fontsHrefFor(Object.keys(FONT_FAMILIES) as ThemeFontFamily[]);
