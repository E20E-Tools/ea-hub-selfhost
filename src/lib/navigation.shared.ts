import { z } from "zod";
import { pick, type Language } from "./language-core";

const internalPaths = new Set([
  "/",
  "/technology-roadmap",
  "/support",
  "/about",
  "/blog",
  "/request",
  "/contact",
  "/affiliates",
  "/testimonials",
  "/consultants",
  "/enterprise-services",
  "/terms",
  "/courses",
  "/consultations",
  "/discover",
  "/my-tools",
  "/compare",
  "/my-requests",
  "/releases",
  "/enterprise-services/request",
  "/transformation",
  "/archone-coming-soon",
  "/design-lab",
]);

export function isNavigationUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      const url = new URL(value, "https://navigation.local");
      return (
        url.origin === "https://navigation.local" &&
        (internalPaths.has(url.pathname) ||
          /^\/(?:product|try|releases)\/[a-z0-9-]+$/.test(url.pathname))
      );
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export const navigationItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  labelAr: z.string().trim().min(1, "اكتب اسم العنصر بالعربية.").max(60),
  labelEn: z.string().trim().max(60),
  url: z
    .string()
    .trim()
    .max(1000)
    .refine(
      isNavigationUrl,
      "استخدم رابط https خارجيًا أو مسار صفحة موجودة في الموقع.",
    ),
  topBar: z.boolean().optional(),
  group: z
    .enum(["platform", "workspace", "company", "appearance", "none"])
    .optional(),
  cta: z.boolean().default(false),
  /** Hidden items stay saved in the menu but are not rendered for visitors. */
  hidden: z.boolean().optional(),
});
export const navigationSchema = z
  .array(navigationItemSchema)
  .max(40)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "معرّفات عناصر القائمة يجب أن تكون مختلفة.",
  );
export type NavigationItem = z.infer<typeof navigationItemSchema>;
export const DEFAULT_NAVIGATION: NavigationItem[] = [
  {
    id: "library",
    labelAr: "المكتبة",
    labelEn: "Library",
    url: "/",
    cta: false,
  },
  {
    id: "roadmap",
    labelAr: "خارطة التقنيات",
    labelEn: "Technology roadmap",
    url: "/technology-roadmap",
    cta: false,
  },
  {
    id: "support",
    labelAr: "ادعمنا",
    labelEn: "Support us",
    url: "/support",
    cta: false,
  },
  {
    id: "about",
    labelAr: "عن المنصة",
    labelEn: "About us",
    url: "/about",
    cta: false,
  },
  {
    id: "consultations",
    labelAr: "الاستشارات",
    labelEn: "Consultations",
    url: "https://www.dt.guide/itconsultations/",
    cta: false,
  },
  {
    id: "courses",
    labelAr: "الدورات",
    labelEn: "Courses",
    url: "https://www.dt.guide/courses/",
    cta: false,
  },
  {
    id: "request",
    labelAr: "أرسل طلبًا",
    labelEn: "Send a request",
    url: "/request",
    cta: true,
  },
  {
    id: "affiliates",
    labelAr: "التوابع",
    labelEn: "Affiliates",
    url: "/affiliates",
    cta: false,
  },
  {
    id: "contact",
    labelAr: "اتصل بنا",
    labelEn: "Contact us",
    url: "/contact",
    cta: false,
  },
  {
    id: "terms",
    labelAr: "شروط الخدمة",
    labelEn: "Terms of service",
    url: "/terms",
    cta: false,
  },
];

export function readNavigation(value: unknown): NavigationItem[] {
  const parsed = navigationSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_NAVIGATION.map((item) => ({ ...item }));
  // The About page moved from /blog to /about; older saved menus follow it without a redirect hop.
  return parsed.data.map((item) =>
    item.url === "/blog" ? { ...item, url: "/about" } : item,
  );
}
export function navigationLabel(
  item: NavigationItem,
  language: Language,
): string {
  return pick(language, item.labelAr, item.labelEn);
}
export function moveNavigation(
  items: NavigationItem[],
  index: number,
  delta: number,
): NavigationItem[] {
  const target = index + delta;
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  )
    return items;
  const next = [...items];
  const item = next[index];
  const other = next[target];
  if (!item || !other) return items;
  next[index] = other;
  next[target] = item;
  return next;
}

// Older menus stored just the editable directory. Materialize the former built-in
// links once, so subsequently removing or moving them survives a reload.
export function placedNavigation(value: unknown): NavigationItem[] {
  const items = readNavigation(value);
  if (
    !items.length ||
    items.some((item) => item.group !== undefined || item.topBar !== undefined)
  )
    return items;
  const top = items.filter((item) => !item.hidden && !item.cta).slice(0, 3);
  const action = items.find((item) => !item.hidden && item.cta);
  const result: NavigationItem[] = items.map((item) => ({
    ...item,
    url:
      item.url === "https://www.dt.guide/courses/"
        ? "/courses"
        : item.url === "https://www.dt.guide/itconsultations/"
          ? "/consultations"
          : item.url,
    topBar: top.includes(item) || item === action,
    group: ["/about", "/contact", "/terms", "/affiliates"].includes(item.url)
      ? "company"
      : "platform",
  }));
  const builtins: [string, string, string][] = [
    ["/discover", "ابدأ باحتياجك", "Start with your need"],
    ["/my-tools", "أدواتي", "My tools"],
    ["/compare", "مقارنة الأدوات", "Compare tools"],
    ["/my-requests", "تتبع طلباتي ومحادثاتي", "Track my requests and chats"],
    ["/design-lab", "استوديو التصميم", "Design studio"],
  ];
  for (const [url, labelAr, labelEn] of builtins) {
    if (items.some((item) => item.url === url)) continue;
    let id = "nav-" + url.slice(1);
    while (result.some((item) => item.id === id)) id += "-x";
    const studio = url === "/design-lab";
    result.push({
      id,
      url,
      labelAr,
      labelEn,
      cta: false,
      topBar: studio,
      group: studio ? "appearance" : "workspace",
    });
  }
  return result;
}
