import { embed, embedMany } from "ai";
import {
  SEMANTIC_DIMENSIONS,
  SEMANTIC_MODEL,
  buildSources,
  embeddingText,
  rankDocuments,
  type IndexedDocument,
  type SemanticHit,
  type SemanticKind,
  type SemanticLanguage,
} from "./semantic.shared";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
/** Stored with each row: a model or size change re-embeds everything on the next run. */
const MODEL_TAG = `${SEMANTIC_MODEL}@${SEMANTIC_DIMENSIONS}`;
const DOCS_TTL_MS = 5 * 60 * 1000;
const QUERY_CACHE_MAX = 200;
const BATCH = 64;

/** True when the server has an OpenAI key; without one every semantic feature stays off. */
export function semanticConfigured(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

async function embeddingModel() {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) return null;
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { boundedAiFetch } = await import("./ai-settings.shared");
  // OPENAI_API_KEY only ever goes to api.openai.com (fixed base URL, no redirects).
  return createOpenAI({
    baseURL: OPENAI_BASE_URL,
    apiKey,
    fetch: boundedAiFetch(OPENAI_BASE_URL),
  }).embeddingModel(SEMANTIC_MODEL);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

let docsCache: { docs: IndexedDocument[]; until: number } | null = null;
const queryCache = new Map<string, number[]>();

export type ReindexResult = {
  indexed: number;
  embedded: number;
  removed: number;
};

/**
 * Brings `semantic_documents` in line with public products, release notes and approved FAQ
 * answers. Only passages whose text or model changed are sent for embedding.
 */
export async function reindexSemantic(): Promise<ReindexResult> {
  const model = await embeddingModel();
  if (!model) throw new Error("Embeddings not configured");
  const { publishableClient } = await import("./catalog.functions");
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");

  // The publishable client sees exactly what visitors see, so nothing private is indexed.
  const products = await publishableClient()
    .from("products")
    .select(
      "id, name, label, label_en, description, description_en, features, features_en, whats_new, whats_new_en, version",
    );
  if (products.error || !products.data) throw new Error("catalog unavailable");
  const faqs = await supabaseAdmin
    .from("faq_answers")
    .select("id, question, answer")
    .eq("enabled", true)
    .limit(500);
  if (faqs.error) throw new Error("faq unavailable");

  const sources = buildSources(products.data, faqs.data ?? []);
  const existing = await supabaseAdmin
    .from("semantic_documents")
    .select("id, content_hash, model");
  if (existing.error) throw new Error("semantic index unavailable");
  const known = new Map(
    (existing.data ?? []).map((row) => [row.id, row] as const),
  );

  const hashed = await Promise.all(
    sources.map(async (source) => ({
      source,
      hash: await sha256(embeddingText(source)),
    })),
  );
  const changed = hashed.filter(({ source, hash }) => {
    const row = known.get(source.id);
    return !row || row.content_hash !== hash || row.model !== MODEL_TAG;
  });

  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = changed.slice(i, i + BATCH);
    const { embeddings } = await embedMany({
      model,
      values: batch.map(({ source }) => embeddingText(source)),
      dimensions: SEMANTIC_DIMENSIONS,
      maxRetries: 1,
    });
    const rows = batch.map(({ source, hash }, j) => ({
      ...source,
      content_hash: hash,
      model: MODEL_TAG,
      embedding: embeddings[j] ?? [],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("semantic_documents")
      .upsert(rows);
    if (error) throw new Error("semantic index write failed");
  }

  const wanted = new Set(sources.map((s) => s.id));
  const stale = [...known.keys()].filter((id) => !wanted.has(id));
  if (stale.length) {
    const { error } = await supabaseAdmin
      .from("semantic_documents")
      .delete()
      .in("id", stale);
    if (error) throw new Error("semantic index cleanup failed");
  }
  docsCache = null;
  return {
    indexed: sources.length,
    embedded: changed.length,
    removed: stale.length,
  };
}

async function indexedDocs(now = Date.now()): Promise<IndexedDocument[]> {
  if (docsCache && docsCache.until > now) return docsCache.docs;
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("semantic_documents")
    .select("id, kind, language, title, body, url, embedding")
    .eq("model", MODEL_TAG);
  if (error) throw new Error("semantic index unavailable");
  const docs = (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as SemanticKind,
    language: row.language as SemanticLanguage,
    title: row.title,
    body: row.body,
    url: row.url,
    embedding: row.embedding,
  }));
  docsCache = { docs, until: now + DOCS_TTL_MS };
  return docs;
}

/** True when this query's embedding is already cached, so answering it costs nothing. */
export function queryCached(query: string): boolean {
  return queryCache.has(query.toLowerCase());
}

async function queryVector(
  model: NonNullable<Awaited<ReturnType<typeof embeddingModel>>>,
  query: string,
): Promise<number[]> {
  const key = query.toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;
  const { embedding } = await embed({
    model,
    value: query,
    dimensions: SEMANTIC_DIMENSIONS,
    maxRetries: 0,
  });
  if (queryCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, embedding);
  return embedding;
}

/** Passages closest in meaning to the query; [] when not configured or nothing is indexed. */
export async function semanticSearch(
  query: string,
  language: SemanticLanguage,
  options: { limit: number; kinds?: SemanticKind[]; snippetLength?: number },
): Promise<SemanticHit[]> {
  const model = await embeddingModel();
  if (!model) return [];
  const docs = await indexedDocs();
  if (!docs.length) return [];
  const vector = await queryVector(model, query);
  return rankDocuments(vector, docs, { language, ...options });
}

/** Archy's extra context: best effort, never delays or breaks the chat for long. */
export async function semanticContext(
  question: string,
  language: SemanticLanguage,
  timeoutMs = 2500,
): Promise<SemanticHit[]> {
  if (!semanticConfigured() || question.trim().length < 3) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      semanticSearch(question.slice(0, 1200), language, {
        limit: 4,
        kinds: ["faq", "release"],
        snippetLength: 600,
      }),
      new Promise<SemanticHit[]>((resolve) => {
        timer = setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error(
      "semantic context failed",
      error instanceof Error ? error.message : "unknown",
    );
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
