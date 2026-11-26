/**
 * Semantic search, pure part: which passages get indexed, how they are ranked and how the
 * best ones are handed to Archy. No I/O here, so it runs in tests and on either side.
 */
export type SemanticKind = "product" | "release" | "faq";
export type SemanticLanguage = "ar" | "en";

/** One passage to embed. `id` is stable, so re-indexing replaces instead of duplicating. */
export type SemanticSource = {
  id: string;
  kind: SemanticKind;
  language: SemanticLanguage;
  title: string;
  body: string;
  url: string;
};

export type IndexedDocument = SemanticSource & { embedding: number[] };

export type SemanticHit = {
  kind: SemanticKind;
  title: string;
  url: string;
  snippet: string;
  score: number;
};

/** Public product row as the indexer reads it (only what visitors can already see). */
export type ProductSourceRow = {
  id: string;
  name: string;
  label: string | null;
  label_en: string | null;
  description: string | null;
  description_en: string | null;
  features: unknown;
  features_en: unknown;
  whats_new: string | null;
  whats_new_en: string | null;
  version: string | null;
};

export type FaqSourceRow = { id: string; question: string; answer: string };

export const SEMANTIC_MODEL = "text-embedding-3-small";
/** Shortened vectors: plenty for a few hundred passages and a quarter of the storage. */
export const SEMANTIC_DIMENSIONS = 512;
/** Below this cosine similarity a passage is treated as unrelated. */
export const SEMANTIC_MIN_SCORE = 0.3;
export const SEMANTIC_QUERY_MIN = 3;
export const SEMANTIC_QUERY_MAX = 200;
const BODY_MAX = 4000;
const SNIPPET_MAX = 160;

const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const list = (value: unknown) =>
  Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const join = (...parts: string[]) =>
  parts.filter(Boolean).join(". ").slice(0, BODY_MAX);

/** Builds every passage to index, in both languages; empty passages are skipped. */
export function buildSources(
  products: ProductSourceRow[],
  faqs: FaqSourceRow[],
): SemanticSource[] {
  const out: SemanticSource[] = [];
  for (const p of products) {
    const name = clean(p.name);
    if (!name) continue;
    const page = "/product/" + encodeURIComponent(p.id);
    const releases = "/releases/" + encodeURIComponent(p.id);
    const version = clean(p.version);
    const langs: [SemanticLanguage, string, string, string[], string][] = [
      [
        "ar",
        clean(p.label),
        clean(p.description),
        list(p.features),
        clean(p.whats_new),
      ],
      [
        "en",
        clean(p.label_en) || clean(p.label),
        clean(p.description_en) || clean(p.description),
        list(p.features_en).length ? list(p.features_en) : list(p.features),
        clean(p.whats_new_en) || clean(p.whats_new),
      ],
    ];
    for (const [language, label, description, features, whatsNew] of langs) {
      const body = join(label, description, features.join(" · "));
      if (body)
        out.push({
          id: `product:${p.id}:${language}`,
          kind: "product",
          language,
          title: name,
          body,
          url: page,
        });
      if (whatsNew)
        out.push({
          id: `release:${p.id}:${language}`,
          kind: "release",
          language,
          title: version ? `${name} ${version}` : name,
          body: join(whatsNew),
          url: releases,
        });
    }
  }
  for (const f of faqs) {
    const question = clean(f.question);
    const answer = clean(f.answer);
    if (!question || !answer) continue;
    // Approved answers are written in one language; Arabic script decides which.
    const language: SemanticLanguage = /[؀-ۿ]/.test(question) ? "ar" : "en";
    out.push({
      id: `faq:${f.id}`,
      kind: "faq",
      language,
      title: question.slice(0, 300),
      body: join(question, answer),
      url: "/",
    });
  }
  return out;
}

/** Text that is actually embedded; its hash decides whether a row needs re-embedding. */
export function embeddingText(source: SemanticSource): string {
  return `${source.title}\n${source.body}`;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function snippet(body: string, max = SNIPPET_MAX): string {
  return body.length > max ? body.slice(0, max - 1).trimEnd() + "…" : body;
}

/**
 * Best passages for a query vector: the visitor's language first (the other language only
 * fills gaps), one hit per page, nothing under the similarity floor.
 */
export function rankDocuments(
  query: number[],
  docs: IndexedDocument[],
  options: {
    language: SemanticLanguage;
    limit: number;
    kinds?: SemanticKind[];
    minScore?: number;
    snippetLength?: number;
  },
): SemanticHit[] {
  const floor = options.minScore ?? SEMANTIC_MIN_SCORE;
  const scored = docs
    .filter((d) => !options.kinds || options.kinds.includes(d.kind))
    .map((d) => ({
      d,
      score: cosine(query, d.embedding),
      own: d.language === options.language ? 1 : 0,
    }))
    .filter((r) => r.score >= floor)
    .sort((a, b) => b.own - a.own || b.score - a.score);
  const seen = new Set<string>();
  const hits: SemanticHit[] = [];
  for (const { d, score } of scored) {
    const key = d.kind === "faq" ? d.id : `${d.kind}:${d.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      kind: d.kind,
      title: d.title,
      url: d.url,
      snippet: snippet(d.body, options.snippetLength),
      score: Math.round(score * 1000) / 1000,
    });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, options.limit));
}

/** Prompt block with the passages Archy may quote; empty when nothing relevant was found. */
export function contextBlock(
  hits: SemanticHit[],
  language: SemanticLanguage,
): string {
  if (!hits.length) return "";
  const head =
    language === "ar"
      ? "مقتطفات من الموقع ذات صلة بسؤال الزائر (استخدمها فقط إن كانت تجيب عنه، ولا تخترع غيرها):"
      : "Site passages related to the visitor's question (use them only if they answer it; invent nothing else):";
  const lines = hits.map(
    (h, i) =>
      `${i + 1}. [${h.kind}] ${h.title}${h.url !== "/" ? ` (${h.url})` : ""}: ${h.snippet}`,
  );
  return `\n\n${head}\n${lines.join("\n")}`;
}

/** Normalizes a visitor query; null when it is too short to search. */
export function normalizeQuery(value: unknown): string | null {
  const q = clean(value).slice(0, SEMANTIC_QUERY_MAX);
  return q.length >= SEMANTIC_QUERY_MIN ? q : null;
}
