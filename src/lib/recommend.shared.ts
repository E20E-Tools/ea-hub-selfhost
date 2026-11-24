import { products } from "./products";

export type RecommendationPick = { id: string; reason: string };
export type Recommendation = { summary: string; picks: RecommendationPick[] };

/** The language the assistant answers in — follows the visitor's own choice. */
export type ReplyLanguage = "ar" | "en";

export function isReplyLanguage(value: unknown): value is ReplyLanguage {
  return value === "ar" || value === "en";
}

/** One line added to every model instruction: which language to write in. */
export function replyRule(language: ReplyLanguage): string {
  return language === "en"
    ? "- Language: write summary, reply and every reason in clear, simple English. Never Arabic."
    : "- اللغة: اكتب الملخص والرد وكل سبب بالعربية الفصحى البسيطة.";
}

/** Only products a visitor can open right now are eligible for a recommendation. */
export type CatalogEntry = {
  servicesEnabled?: boolean;
  id: string;
  name: string;
  label: string;
  description: string;
  comingSoon?: boolean;
  features?: string[];
  featuresEn?: string[];
  labelEn?: string;
  descriptionEn?: string;
};

export function availableProducts(list: CatalogEntry[] = products) {
  return list.filter((product) => !product.comingSoon);
}

/** The catalogue exactly as the model is allowed to see it, in the reply language. */
export function catalogLines(
  list: CatalogEntry[] = products,
  language: ReplyLanguage = "ar",
) {
  return availableProducts(list)
    .map((product) =>
      language === "en"
        ? `- id=${product.id} | page=/product/${encodeURIComponent(product.id)} | ${product.name} | ${product.labelEn || product.label} | ${product.descriptionEn || product.description}`
        : `- id=${product.id} | page=/product/${encodeURIComponent(product.id)} | ${product.name} | ${product.label} | ${product.description}`,
    )
    .join("\n");
}

/** Keeps only ids that really exist in the catalogue, dropping anything not yet launched. */
export function sanitizeRecommendation(
  raw: unknown,
  list: CatalogEntry[] = products,
): Recommendation {
  const eligible = availableProducts(list);
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary =
    typeof source["summary"] === "string" ? source["summary"].trim() : "";
  const rawPicks = Array.isArray(source["picks"]) ? source["picks"] : [];
  const seen = new Set<string>();
  const picks: RecommendationPick[] = [];

  for (const item of rawPicks) {
    const entry =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const id = typeof entry["id"] === "string" ? entry["id"].trim() : "";
    if (!id || seen.has(id) || !eligible.some((product) => product.id === id))
      continue;
    seen.add(id);
    picks.push({
      id,
      reason: typeof entry["reason"] === "string" ? entry["reason"].trim() : "",
    });
    if (picks.length === 3) break;
  }

  return { summary, picks };
}
