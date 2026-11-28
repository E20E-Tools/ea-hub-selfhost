/**
 * Serializable description of one data request. The query builder fills it; the server
 * compiles it to SQL (directly on the server, or after the browser POSTs it to
 * /api/selfhost/rest). Nothing here is trusted on the server: every identifier is validated
 * and every value is sent as a bound parameter.
 */
export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "cs"
  | "cd";

export type Filter =
  | {
      kind: "op";
      column: string;
      op: FilterOp;
      value: unknown;
      negate?: boolean | undefined;
    }
  | {
      kind: "raw";
      column: string;
      operator: string;
      value: string;
      negate?: boolean | undefined;
    }
  | { kind: "or"; expr: string };

export type Order = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean | undefined;
};

export type QuerySpec = {
  schema: string;
  table?: string | undefined;
  action: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  fn?: string | undefined;
  args?: Record<string, unknown> | undefined;
  columns?: string | undefined;
  returning: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[] | undefined;
  onConflict?: string | undefined;
  ignoreDuplicates?: boolean | undefined;
  defaultToNull?: boolean | undefined;
  filters: Filter[];
  order: Order[];
  limit?: number | undefined;
  offset?: number | undefined;
  single?: "single" | "maybe" | undefined;
  count?: "exact" | "planned" | "estimated" | undefined;
  head?: boolean | undefined;
};

export type ApiError = {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
};

export type QueryResult = {
  data: unknown;
  error: ApiError | null;
  count: number | null;
  status: number;
  statusText: string;
};

export function apiError(
  message: string,
  code = "SELFHOST",
  details: string | null = null,
  hint: string | null = null,
): ApiError {
  return { message, code, details, hint };
}

export function failure(error: ApiError, status = 400): QueryResult {
  return { data: null, error, count: null, status, statusText: "Error" };
}
