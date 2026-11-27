import type { QueryResult, QuerySpec } from "../supabase-js/spec";
import { apiError, failure } from "../supabase-js/spec";
import { functionCandidates, relationsFor, tableInfo } from "./catalog";
import { CompileError, Compiler, type CatalogLookup } from "./compile";
import { asRole, type RequestAuth } from "./db";

export const liveCatalog: CatalogLookup = {
  table: tableInfo,
  relations: relationsFor,
  functions: functionCandidates,
};

type PgError = Error & { code?: string; detail?: string; hint?: string };

function statusFor(code: string | undefined): number {
  if (!code) return 500;
  if (code === "42501") return 403; // insufficient_privilege / RLS
  if (code === "23505") return 409;
  if (code.startsWith("23") || code.startsWith("22")) return 400;
  if (code === "P0001") return 400;
  return 400;
}

function parseData(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

/** Executes one QuerySpec with the given API role. Never throws: errors come back in `error`. */
export async function executeSpec(
  spec: QuerySpec,
  auth: RequestAuth,
  lookup: CatalogLookup = liveCatalog,
): Promise<QueryResult> {
  try {
    const compiled = await new Compiler(lookup).compile(spec);
    const outcome = await asRole(auth, async (tx) => {
      let count: number | null = null;
      if (compiled.countText) {
        const rows = await tx.unsafe(
          compiled.countText,
          compiled.countParams ?? [],
        );
        count = Number(
          (rows[0] as { count: string | number } | undefined)?.count ?? 0,
        );
        if (spec.head) return { data: null, count };
      }
      const rows = await tx.unsafe(compiled.text, compiled.params);
      if (compiled.minimal) {
        if (spec.count) count = rows.count ?? null;
        return { data: null, count };
      }
      const data = parseData(
        (rows[0] as { data: unknown } | undefined)?.data ?? null,
      );
      return { data, count };
    });
    let data = outcome.data;
    if (spec.single && !compiled.scalar && !compiled.minimal) {
      const list = Array.isArray(data) ? data : [];
      if (list.length > 1 || (spec.single === "single" && list.length === 0)) {
        return failure(
          apiError(
            "JSON object requested, multiple (or no) rows returned",
            "PGRST116",
            `The result contains ${list.length} rows`,
          ),
          406,
        );
      }
      data = list[0] ?? null;
    }
    const status =
      spec.action === "insert" || spec.action === "upsert"
        ? 201
        : spec.head
          ? 200
          : 200;
    return {
      data,
      error: null,
      count: outcome.count,
      status,
      statusText: "OK",
    };
  } catch (error) {
    if (error instanceof CompileError)
      return failure(apiError(error.message, error.code), error.status);
    const e = error as PgError;
    if (e?.code && /^[0-9A-Z]{5}$/.test(e.code)) {
      return failure(
        apiError(e.message, e.code, e.detail ?? null, e.hint ?? null),
        statusFor(e.code),
      );
    }
    console.error("[selfhost] query failed", e?.message ?? e);
    return failure(apiError("Database request failed", "SELFHOST_DB"), 503);
  }
}
