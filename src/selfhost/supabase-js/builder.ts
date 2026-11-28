import type { Filter, FilterOp, QueryResult, QuerySpec } from "./spec";
import { failure, apiError } from "./spec";

export type Executor = (spec: QuerySpec) => Promise<QueryResult>;

type Values = Record<string, unknown> | Record<string, unknown>[];

/** Drops `undefined` like JSON.stringify does, so callers see the same columns as Supabase. */
function clean(values: Values): Values {
  const one = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  return Array.isArray(values) ? values.map(one) : one(values);
}

/**
 * A thenable query builder with the subset of the supabase-js / PostgREST API that EA-Hub
 * uses. It only records a QuerySpec; `then` hands it to the executor.
 */
export class QueryBuilder implements PromiseLike<QueryResult> {
  private spec: QuerySpec;
  private shouldThrow = false;

  constructor(
    private readonly execute: Executor,
    init: Partial<QuerySpec> & Pick<QuerySpec, "action">,
  ) {
    this.spec = {
      schema: "public",
      returning: false,
      filters: [],
      order: [],
      ...init,
    };
  }

  // ---------- actions ----------
  select(
    columns = "*",
    options: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {},
  ): this {
    if (this.spec.action === "select" || this.spec.action === "rpc") {
      this.spec.columns = columns;
      if (options.count) this.spec.count = options.count;
      if (options.head) this.spec.head = true;
    } else {
      this.spec.returning = true;
      this.spec.columns = columns;
    }
    return this;
  }

  insert(
    values: Values,
    options: { count?: "exact"; defaultToNull?: boolean } = {},
  ): this {
    this.spec.action = "insert";
    this.spec.values = clean(values);
    this.spec.defaultToNull = options.defaultToNull ?? true;
    if (options.count) this.spec.count = options.count;
    return this;
  }

  upsert(
    values: Values,
    options: {
      onConflict?: string;
      ignoreDuplicates?: boolean;
      count?: "exact";
      defaultToNull?: boolean;
    } = {},
  ): this {
    this.spec.action = "upsert";
    this.spec.values = clean(values);
    this.spec.onConflict = options.onConflict;
    this.spec.ignoreDuplicates = options.ignoreDuplicates ?? false;
    this.spec.defaultToNull = options.defaultToNull ?? true;
    if (options.count) this.spec.count = options.count;
    return this;
  }

  update(
    values: Record<string, unknown>,
    options: { count?: "exact" } = {},
  ): this {
    this.spec.action = "update";
    this.spec.values = clean(values);
    if (options.count) this.spec.count = options.count;
    return this;
  }

  delete(options: { count?: "exact" } = {}): this {
    this.spec.action = "delete";
    if (options.count) this.spec.count = options.count;
    return this;
  }

  // ---------- filters ----------
  private op(column: string, op: FilterOp, value: unknown): this {
    this.spec.filters.push({ kind: "op", column, op, value });
    return this;
  }
  eq(column: string, value: unknown): this {
    return this.op(column, "eq", value);
  }
  neq(column: string, value: unknown): this {
    return this.op(column, "neq", value);
  }
  gt(column: string, value: unknown): this {
    return this.op(column, "gt", value);
  }
  gte(column: string, value: unknown): this {
    return this.op(column, "gte", value);
  }
  lt(column: string, value: unknown): this {
    return this.op(column, "lt", value);
  }
  lte(column: string, value: unknown): this {
    return this.op(column, "lte", value);
  }
  like(column: string, pattern: string): this {
    return this.op(column, "like", pattern);
  }
  ilike(column: string, pattern: string): this {
    return this.op(column, "ilike", pattern);
  }
  is(column: string, value: null | boolean): this {
    return this.op(column, "is", value);
  }
  in(column: string, values: readonly unknown[]): this {
    return this.op(column, "in", [...values]);
  }
  contains(column: string, value: unknown): this {
    return this.op(column, "cs", value);
  }
  containedBy(column: string, value: unknown): this {
    return this.op(column, "cd", value);
  }
  match(query: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  not(column: string, operator: string, value: unknown): this {
    this.spec.filters.push({
      kind: "raw",
      column,
      operator,
      value: value === null ? "null" : String(value),
      negate: true,
    });
    return this;
  }
  filter(column: string, operator: string, value: unknown): this {
    this.spec.filters.push({
      kind: "raw",
      column,
      operator,
      value: value === null ? "null" : String(value),
    });
    return this;
  }
  or(
    expr: string,
    options: { foreignTable?: string; referencedTable?: string } = {},
  ): this {
    if (options.foreignTable || options.referencedTable)
      throw new Error(
        "or() on an embedded table is not supported by the self-host adapter",
      );
    this.spec.filters.push({ kind: "or", expr } satisfies Filter);
    return this;
  }

  // ---------- modifiers ----------
  order(
    column: string,
    options: {
      ascending?: boolean;
      nullsFirst?: boolean;
      foreignTable?: string;
      referencedTable?: string;
    } = {},
  ): this {
    if (options.foreignTable || options.referencedTable)
      throw new Error(
        "order() on an embedded table is not supported by the self-host adapter",
      );
    this.spec.order.push({
      column,
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }
  limit(count: number): this {
    this.spec.limit = count;
    return this;
  }
  range(from: number, to: number): this {
    this.spec.offset = from;
    this.spec.limit = to - from + 1;
    return this;
  }
  single(): this {
    this.spec.single = "single";
    return this;
  }
  maybeSingle(): this {
    this.spec.single = "maybe";
    return this;
  }
  abortSignal(_signal: AbortSignal): this {
    return this;
  }
  returns<_T>(): this {
    return this;
  }
  overrideTypes<_T>(): this {
    return this;
  }
  throwOnError(): this {
    this.shouldThrow = true;
    return this;
  }

  /** For tests and the HTTP bridge. */
  toSpec(): QuerySpec {
    return JSON.parse(JSON.stringify(this.spec)) as QuerySpec;
  }

  private async run(): Promise<QueryResult> {
    let result: QueryResult;
    try {
      result = await this.execute(this.toSpec());
    } catch (error) {
      result = failure(
        apiError(
          error instanceof Error ? error.message : String(error),
          "SELFHOST_FETCH",
        ),
        0,
      );
    }
    if (this.shouldThrow && result.error) {
      const err = Object.assign(new Error(result.error.message), result.error);
      throw err;
    }
    return result;
  }

  then<R1 = QueryResult, R2 = never>(
    onfulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ) {
    return this.run().catch(onrejected);
  }
  finally(onfinally?: (() => void) | null) {
    return this.run().finally(onfinally);
  }
}

export function fromTable(execute: Executor, table: string, schema = "public") {
  return new QueryBuilder(execute, { action: "select", table, schema });
}

export function rpcCall(
  execute: Executor,
  fn: string,
  args: Record<string, unknown> = {},
  options: { head?: boolean; count?: "exact" } = {},
  schema = "public",
) {
  const b = new QueryBuilder(execute, {
    action: "rpc",
    fn,
    args: clean(args) as Record<string, unknown>,
    schema,
  });
  if (options.head || options.count) b.select("*", options);
  return b;
}
