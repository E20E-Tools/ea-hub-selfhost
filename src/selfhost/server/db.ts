import postgres from "postgres";
import { selfhostConfig } from "./config";

type Sql = postgres.Sql<Record<string, never>>;
let pool: Sql | undefined;

/** One shared pool for the whole server process. Never logs the URL. */
export function db(): Sql {
  if (!pool) {
    const { databaseUrl, databasePoolSize } = selfhostConfig();
    pool = postgres(databaseUrl, {
      max: databasePoolSize,
      idle_timeout: 30,
      connect_timeout: 15,
      onnotice: () => {},
      // Results are produced as JSON by Postgres itself (json_agg), the same way PostgREST
      // does, so timestamps and numbers keep the exact format Supabase returned.
      types: {},
    }) as unknown as Sql;
  }
  return pool;
}

export type DbRole = "anon" | "authenticated" | "service_role";
export type RequestAuth = { role: DbRole; claims: Record<string, unknown> };

export const SERVICE: RequestAuth = {
  role: "service_role",
  claims: { role: "service_role" },
};
export const ANON: RequestAuth = { role: "anon", claims: { role: "anon" } };

type Tx = postgres.TransactionSql<Record<string, never>>;

/**
 * Runs `work` inside a transaction that impersonates an API role, exactly like PostgREST:
 * `role` and `request.jwt.claims` are transaction-local, so RLS policies, auth.uid() and
 * auth.role() see the same values they saw on Supabase.
 */
export async function asRole<T>(
  auth: RequestAuth,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx.unsafe(
      "select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)",
      [auth.role, JSON.stringify(auth.claims)],
    );
    return work(tx as unknown as Tx);
  })) as T;
}

export type { Tx };
