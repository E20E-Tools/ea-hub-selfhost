import { createServerFn } from "@tanstack/react-start";
import {
  normalizeQuery,
  type SemanticHit,
  type SemanticLanguage,
} from "./semantic.shared";

export type SemanticSearchResult = {
  /** False when search by meaning is off, limited or failed; the palette then shows text matches only. */
  ok: boolean;
  hits: SemanticHit[];
};

/** Site-wide daily cap on query embeddings (cheap, but bounded like every paid call). */
export const SEARCH_GLOBAL_DAY_LIMIT = 3000;
export const SEARCH_GLOBAL_BUCKET = "search:global-day";
/** One client's daily share, well under the site-wide cap so no single IP can exhaust it. */
export const SEARCH_IP_DAY_LIMIT = 200;

/** Search by meaning for the Ctrl/Cmd+K palette: products and release notes only. */
export const searchByMeaning = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const source =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const language: SemanticLanguage =
      source["language"] === "en" ? "en" : "ar";
    return { query: normalizeQuery(source["query"]), language };
  })
  .handler(async ({ data }): Promise<SemanticSearchResult> => {
    const off = { ok: false, hits: [] };
    if (!data.query) return off;
    const { semanticConfigured, semanticSearch, queryCached } =
      await import("./semantic.server");
    if (!semanticConfigured()) return off;
    const { getRequest } = await import("@tanstack/react-start/server");
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    const ip = clientIp(getRequest());
    const allowed = await consumeLimits([
      { bucket: "search:ip", subject: ip, limit: 40, windowSeconds: 600 },
      {
        bucket: "search:ip-day",
        subject: ip,
        limit: SEARCH_IP_DAY_LIMIT,
        windowSeconds: 86_400,
      },
      // The site-wide budget counts paid embeddings only; a cached query is free.
      ...(queryCached(data.query)
        ? []
        : [
            {
              bucket: SEARCH_GLOBAL_BUCKET,
              subject: "all",
              limit: SEARCH_GLOBAL_DAY_LIMIT,
              windowSeconds: 86_400,
            },
          ]),
    ]);
    if (!allowed) return off;
    try {
      const hits = await semanticSearch(data.query, data.language, {
        limit: 5,
        kinds: ["product", "release"],
      });
      return { ok: true, hits };
    } catch (error) {
      console.error(
        "semantic search failed",
        error instanceof Error ? error.message : "unknown",
      );
      return off;
    }
  });
