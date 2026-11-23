/** Pure helpers for "Problem to Tool" (browser-safe; local word matching, no AI). */
import type { Product } from "@/lib/catalog";
import type { Language } from "@/lib/language-core";

/** Sensible defaults by product id until the owner fills the product's "problem" field. */
export const DEFAULT_PROBLEMS: Record<string, { ar: string; en: string }> = {
  archone: {
    ar: "قدراتنا وعملياتنا غير موثّقة، ولا نعرف أي تطبيق يخدم كل قدرة",
    en: "Our capabilities and processes aren't modelled, so we can't tell which app serves each one",
  },
  landscape: {
    ar: "لا نرى خريطة تطبيقاتنا وعلاقاتها، ولا نكتشف التكرار بين الأنظمة",
    en: "We can't see our application map or spot overlap between systems",
  },
  radar: {
    ar: "نحتاج تصنيفًا واضحًا للتقنيات: أيها نتبنّى ونجرّب ونقيّم ونوقف",
    en: "We need a clear radar of which technologies to adopt, trial, assess or hold",
  },
  itfm: {
    ar: "تكاليف السحابة والتراخيص متفرقة، ولا نعرف ما تكلّفه كل خدمة مقابل الميزانية",
    en: "Cloud and licence costs are scattered and we can't compare service spend with budget",
  },
  innovation: {
    ar: "الأفكار تصلنا من كل الإدارات ولا تُقيَّم ولا تتحول إلى مبادرات",
    en: "Ideas from every department never get evaluated or turned into initiatives",
  },
  platform: {
    ar: "نماذج المؤسسة والرادار والخريطة في أدوات منفصلة، ولا تقارير موحّدة لأصحاب القرار",
    en: "Our enterprise model, radar and app map sit in separate tools with no unified reports",
  },
};

export const TYPE_MS = 45;
export const HOLD_MS = 2600;
export const CLEAR_MS = 500;

/** Owner text first, then the id default, then the product description. */
export function problemFor(product: Product, language: Language): string {
  const own = product.beneficiaryDetails?.problem;
  const ownText = language === "en" ? own?.en || own?.ar : own?.ar;
  if (ownText?.trim()) return ownText.trim();
  const def = DEFAULT_PROBLEMS[product.id];
  if (def) return language === "en" ? def.en : def.ar;
  return product.description;
}

/** Duration of one cycle for a problem text (~6s for typical lengths). */
export function cycleMs(text: string): number {
  return Array.from(text).length * TYPE_MS + HOLD_MS + CLEAR_MS;
}

/** Typing state `ms` into a cycle. */
export function typingAt(text: string, ms: number) {
  const chars = Array.from(text);
  const typeEnd = chars.length * TYPE_MS;
  if (ms < typeEnd)
    return { shown: chars.slice(0, Math.floor(ms / TYPE_MS)).join(""), phase: "typing" as const };
  if (ms < typeEnd + HOLD_MS) return { shown: text, phase: "match" as const };
  return { shown: text, phase: "clear" as const };
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.replace(/^ال/, ""))
    .filter((w) => w.length >= 2);
}

/** Simple local score: shared words (prefix match counts) against name, problem, description, keywords. */
export function scoreProduct(query: string, product: Product, language: Language): number {
  const q = words(query);
  if (!q.length) return 0;
  const hay = words(
    [
      product.name,
      problemFor(product, language),
      product.description,
      product.label,
      product.keywords,
      product.features.join(" "),
    ].join(" "),
  );
  let score = 0;
  for (const w of q) {
    if (hay.includes(w)) score += 2;
    else if (
      hay.some((h) => h.startsWith(w) || (w.length >= 4 && w.startsWith(h) && h.length >= 3))
    )
      score += 1;
  }
  return score;
}

/** Closest product id for the typed text, or null when nothing shares a word. */
export function bestMatch(query: string, products: Product[], language: Language): string | null {
  let best: string | null = null;
  let top = 0;
  for (const p of products) {
    const s = scoreProduct(query, p, language);
    if (s > top) {
      top = s;
      best = p.id;
    }
  }
  return best;
}
