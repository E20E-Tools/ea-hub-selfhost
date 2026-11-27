import type { Filter, FilterOp, QuerySpec } from "../supabase-js/spec";
import type { FunctionInfo, Relation, TableInfo } from "./catalog";

/** What the compiler needs to know about the database. Injected so it can be unit-tested. */
export type CatalogLookup = {
  table(schema: string, name: string): Promise<TableInfo | undefined>;
  relations(table: string): Promise<Relation[]>;
  functions(name: string): Promise<FunctionInfo[]>;
};

export class CompileError extends Error {
  constructor(
    message: string,
    readonly code = "PGRST100",
    readonly status = 400,
  ) {
    super(message);
  }
}

export type Compiled = {
  /** returns one row with a `data` json column (or no rows when `returning` is false) */
  text: string;
  params: (string | null)[];
  countText?: string;
  countParams?: (string | null)[];
  /** rpc returning a scalar or object: data is not an array */
  scalar?: boolean;
  /** insert/update/delete without returning */
  minimal?: boolean;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_SCHEMAS = new Set(["public"]);

export function ident(name: string): string {
  if (!IDENT.test(name))
    throw new CompileError(`Invalid identifier: ${name.slice(0, 64)}`);
  return `"${name}"`;
}

// ---------- values ----------
function arrayLiteral(values: unknown[]): string {
  return `{${values
    .map((v) => {
      if (v === null || v === undefined) return "NULL";
      if (Array.isArray(v)) return arrayLiteral(v);
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    })
    .join(",")}}`;
}

/** Turns a JS value into the text form Postgres parses for `type` (what PostgREST receives as JSON). */
export function encodeValue(
  value: unknown,
  type: string | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const t = (type ?? "").toLowerCase();
  if (t === "json" || t === "jsonb") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return t.endsWith("[]") || !t ? arrayLiteral(value) : JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

class Params {
  readonly list: (string | null)[] = [];
  add(value: unknown, type: string | undefined): string {
    this.list.push(encodeValue(value, type));
    const n = `$${this.list.length}`;
    return type ? `${n}::${castType(type)}` : n;
  }
}

/** format_type output is safe SQL, but keep it to a strict whitelist of characters anyway. */
function castType(type: string): string {
  if (!/^[A-Za-z0-9_ ."[\](),]+$/.test(type))
    throw new CompileError("Unsupported column type");
  return type;
}

// Casts a client may request in a select list (`col::text`). A fixed list, never free text:
// the select string comes from browsers via /api/selfhost/rest.
const SELECT_CASTS = new Set([
  "text",
  "uuid",
  "int4",
  "int8",
  "integer",
  "bigint",
  "numeric",
  "float8",
  "boolean",
  "json",
  "jsonb",
  "date",
  "timestamptz",
]);

// ---------- select list ----------
type SelectItem =
  | { kind: "star" }
  | {
      kind: "column";
      name: string;
      alias?: string | undefined;
      cast?: string | undefined;
    }
  | {
      kind: "embed";
      relation: string;
      alias?: string | undefined;
      hint?: string | undefined;
      items: SelectItem[];
    };

function splitTop(input: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"' && input[i - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth < 0) throw new CompileError("Unbalanced parentheses");
      if (ch === sep && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (depth !== 0 || quoted)
    throw new CompileError("Unbalanced parentheses or quotes");
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseSelect(columns: string | undefined): SelectItem[] {
  const text = (columns ?? "*").replace(/\s+/g, " ").trim() || "*";
  return splitTop(text).map((raw): SelectItem => {
    const item = raw.trim();
    if (item === "*") return { kind: "star" };
    const open = item.indexOf("(");
    if (open > 0) {
      if (!item.endsWith(")"))
        throw new CompileError(`Invalid select item: ${item.slice(0, 64)}`);
      let head = item.slice(0, open).trim();
      const inner = item.slice(open + 1, -1);
      let alias: string | undefined;
      const colon = head.indexOf(":");
      if (colon > 0) {
        alias = head.slice(0, colon).trim();
        head = head.slice(colon + 1).trim();
      }
      const [relation, hint] = head.split("!").map((s) => s.trim());
      return {
        kind: "embed",
        relation: relation!,
        alias,
        hint,
        items: parseSelect(inner),
      };
    }
    let name = item;
    let alias: string | undefined;
    let cast: string | undefined;
    const castAt = name.indexOf("::");
    if (castAt > 0) {
      cast = name
        .slice(castAt + 2)
        .trim()
        .toLowerCase();
      name = name.slice(0, castAt).trim();
      if (!SELECT_CASTS.has(cast))
        throw new CompileError(`Unsupported cast: ${cast.slice(0, 32)}`);
    }
    const colon = name.indexOf(":");
    if (colon > 0) {
      alias = name.slice(0, colon).trim();
      name = name.slice(colon + 1).trim();
    }
    return { kind: "column", name, alias, cast };
  });
}

// ---------- compiler ----------
type Scope = {
  table: TableInfo;
  alias: string;
};

export class Compiler {
  private params = new Params();
  private aliasSeq = 0;

  constructor(private readonly lookup: CatalogLookup) {}

  private nextAlias(): string {
    return `_t${this.aliasSeq++}`;
  }

  private async table(
    schema: string,
    name: string | undefined,
  ): Promise<TableInfo> {
    if (!ALLOWED_SCHEMAS.has(schema))
      throw new CompileError("Schema is not exposed", "PGRST106");
    if (!name) throw new CompileError("Missing table");
    ident(name);
    const info = await this.lookup.table(schema, name);
    if (!info)
      throw new CompileError(
        `Could not find the table '${schema}.${name}' in the schema cache`,
        "PGRST205",
        404,
      );
    return info;
  }

  private columnType(table: TableInfo, column: string): string {
    ident(column);
    const type = table.columns.get(column);
    if (!type)
      throw new CompileError(
        `Could not find the '${column}' column of '${table.name}' in the schema cache`,
        "PGRST204",
      );
    return type;
  }

  private async relation(
    base: TableInfo,
    target: string,
    hint: string | undefined,
  ): Promise<{ rel: Relation; toOne: boolean; target: TableInfo }> {
    const targetInfo = await this.table(base.schema, target);
    const all = await this.lookup.relations(base.name);
    let candidates = all.filter(
      (r) =>
        (r.from === base.name && r.to === target) ||
        (r.from === target && r.to === base.name),
    );
    if (hint && hint !== "inner" && hint !== "left") {
      candidates = candidates.filter(
        (r) => r.constraint === hint || r.fromColumns.includes(hint),
      );
    }
    if (candidates.length === 0)
      throw new CompileError(
        `Could not find a relationship between '${base.name}' and '${target}' in the schema cache`,
        "PGRST200",
      );
    if (candidates.length > 1)
      throw new CompileError(
        `More than one relationship was found for '${base.name}' and '${target}'`,
        "PGRST201",
      );
    const rel = candidates[0]!;
    return { rel, toOne: rel.from === base.name, target: targetInfo };
  }

  private joinCondition(
    rel: Relation,
    toOne: boolean,
    outer: string,
    inner: string,
  ): string {
    const pairs = rel.fromColumns.map((fromCol, i) => {
      const toCol = rel.toColumns[i]!;
      return toOne
        ? `${inner}.${ident(toCol)} = ${outer}.${ident(fromCol)}`
        : `${inner}.${ident(fromCol)} = ${outer}.${ident(toCol)}`;
    });
    return pairs.join(" and ");
  }

  /** Returns select-list SQL plus the WHERE conditions that `!inner` embeds add to the parent. */
  private async selectList(
    scope: Scope,
    items: SelectItem[],
    filters: Filter[],
  ): Promise<{ list: string; innerConditions: string[] }> {
    const parts: string[] = [];
    const innerConditions: string[] = [];
    for (const item of items) {
      if (item.kind === "star") {
        parts.push(`${scope.alias}.*`);
      } else if (item.kind === "column") {
        this.columnType(scope.table, item.name);
        const expr = `${scope.alias}.${ident(item.name)}`;
        const cast =
          item.cast && SELECT_CASTS.has(item.cast) ? `::${item.cast}` : "";
        parts.push(`${expr}${cast} as ${ident(item.alias ?? item.name)}`);
      } else {
        const { rel, toOne, target } = await this.relation(
          scope.table,
          item.relation,
          item.hint,
        );
        const innerAlias = this.nextAlias();
        const innerScope: Scope = { table: target, alias: innerAlias };
        const own = filters.filter(
          (f) =>
            f.kind !== "or" &&
            embeddedName(f.column) === (item.alias ?? item.relation),
        );
        const ownConds = this.filterConditions(
          innerScope,
          own.map((f) => ({
            ...f,
            column: (f as { column: string }).column.split(".")[1]!,
          })) as Filter[],
        );
        const nested = await this.selectList(innerScope, item.items, []);
        const join = this.joinCondition(rel, toOne, scope.alias, innerAlias);
        const where = [join, ...ownConds, ...nested.innerConditions].join(
          " and ",
        );
        const from = `${ident(target.schema)}.${ident(target.name)} ${innerAlias}`;
        const sub = toOne
          ? `(select to_json(_e) from (select ${nested.list} from ${from} where ${where} limit 1) _e)`
          : `(select coalesce(json_agg(_e), '[]'::json) from (select ${nested.list} from ${from} where ${where}) _e)`;
        parts.push(`${sub} as ${ident(item.alias ?? item.relation)}`);
        if (item.hint === "inner") {
          innerConditions.push(`exists (select 1 from ${from} where ${where})`);
        }
      }
    }
    return { list: parts.join(", ") || `${scope.alias}.*`, innerConditions };
  }

  // ---------- filters ----------
  private condition(
    scope: Scope,
    column: string,
    op: FilterOp,
    value: unknown,
    negate = false,
  ): string {
    const type = this.columnType(scope.table, column);
    const col = `${scope.alias}.${ident(column)}`;
    let sql: string;
    switch (op) {
      case "eq":
        sql = `${col} = ${this.params.add(value, type)}`;
        break;
      case "neq":
        sql = `${col} <> ${this.params.add(value, type)}`;
        break;
      case "gt":
        sql = `${col} > ${this.params.add(value, type)}`;
        break;
      case "gte":
        sql = `${col} >= ${this.params.add(value, type)}`;
        break;
      case "lt":
        sql = `${col} < ${this.params.add(value, type)}`;
        break;
      case "lte":
        sql = `${col} <= ${this.params.add(value, type)}`;
        break;
      case "like":
      case "ilike": {
        const pattern = String(value).replace(/\*/g, "%");
        sql = `${col}::text ${op === "like" ? "like" : "ilike"} ${this.params.add(pattern, "text")}`;
        break;
      }
      case "is": {
        const v =
          value === null || value === "null"
            ? "null"
            : value === true || value === "true"
              ? "true"
              : value === false || value === "false"
                ? "false"
                : value === "unknown"
                  ? "unknown"
                  : undefined;
        if (!v)
          throw new CompileError("is() accepts null, true, false or unknown");
        sql = `${col} is ${v}`;
        break;
      }
      case "in": {
        const list = Array.isArray(value) ? value : parseList(String(value));
        sql = list.length
          ? `${col} in (${list.map((v) => this.params.add(v, type)).join(", ")})`
          : "false";
        break;
      }
      case "cs":
        sql = `${col} @> ${this.params.add(value, type)}`;
        break;
      case "cd":
        sql = `${col} <@ ${this.params.add(value, type)}`;
        break;
      default:
        throw new CompileError(`Unsupported operator ${String(op)}`);
    }
    return negate ? `not (${sql})` : sql;
  }

  private rawCondition(
    scope: Scope,
    column: string,
    operator: string,
    value: string,
    negate = false,
  ): string {
    let op = operator;
    let neg = negate;
    if (op.startsWith("not.")) {
      neg = !neg;
      op = op.slice(4);
    }
    if (!isFilterOp(op))
      throw new CompileError(`Unsupported operator ${op.slice(0, 16)}`);
    const v = op === "is" || op === "in" ? value : unquote(value);
    let parsed: unknown = v;
    if (op === "cs" || op === "cd") parsed = parseContainer(v);
    return this.condition(scope, column, op, parsed, neg);
  }

  private orTree(scope: Scope, expr: string, joiner: "or" | "and"): string {
    const parts = splitTop(expr).map((part) => {
      let p = part;
      let negate = false;
      if (p.startsWith("not.")) {
        negate = true;
        p = p.slice(4);
      }
      const group = /^(and|or)\((.*)\)$/s.exec(p);
      if (group) {
        const inner = this.orTree(scope, group[2]!, group[1] as "or" | "and");
        return negate ? `not (${inner})` : `(${inner})`;
      }
      const first = p.indexOf(".");
      if (first < 1)
        throw new CompileError(`Invalid filter: ${p.slice(0, 64)}`);
      const column = p.slice(0, first);
      let rest = p.slice(first + 1);
      if (rest.startsWith("not.")) {
        negate = !negate;
        rest = rest.slice(4);
      }
      const second = rest.indexOf(".");
      if (second < 1)
        throw new CompileError(`Invalid filter: ${p.slice(0, 64)}`);
      return this.rawCondition(
        scope,
        column,
        rest.slice(0, second),
        rest.slice(second + 1),
        negate,
      );
    });
    if (!parts.length) throw new CompileError("Empty or() filter");
    return parts.join(` ${joiner} `);
  }

  private filterConditions(scope: Scope, filters: Filter[]): string[] {
    return filters.map((f) => {
      if (f.kind === "or") return `(${this.orTree(scope, f.expr, "or")})`;
      if (f.kind === "raw")
        return this.rawCondition(
          scope,
          f.column,
          f.operator,
          f.value,
          f.negate,
        );
      return this.condition(scope, f.column, f.op, f.value, f.negate);
    });
  }

  private baseFilters(filters: Filter[]): Filter[] {
    return filters.filter((f) => f.kind === "or" || !f.column.includes("."));
  }

  private orderLimit(scope: Scope, spec: QuerySpec): string {
    const order = spec.order.map((o) => {
      this.columnType(scope.table, o.column);
      const nulls =
        o.nullsFirst === undefined
          ? ""
          : o.nullsFirst
            ? " nulls first"
            : " nulls last";
      return `${scope.alias}.${ident(o.column)} ${o.ascending ? "asc" : "desc"}${nulls}`;
    });
    let sql = order.length ? ` order by ${order.join(", ")}` : "";
    if (spec.limit !== undefined) sql += ` limit ${int(spec.limit)}`;
    if (spec.offset !== undefined) sql += ` offset ${int(spec.offset)}`;
    return sql;
  }

  // ---------- entry points ----------
  async compile(spec: QuerySpec): Promise<Compiled> {
    switch (spec.action) {
      case "select":
        return this.compileSelect(spec);
      case "insert":
      case "upsert":
        return this.compileInsert(spec);
      case "update":
        return this.compileUpdate(spec);
      case "delete":
        return this.compileDelete(spec);
      case "rpc":
        return this.compileRpc(spec);
      default:
        throw new CompileError("Unsupported action");
    }
  }

  private async compileSelect(spec: QuerySpec): Promise<Compiled> {
    const table = await this.table(spec.schema, spec.table);
    const scope: Scope = { table, alias: this.nextAlias() };
    const items = parseSelect(spec.columns);
    const { list, innerConditions } = await this.selectList(
      scope,
      items,
      spec.filters,
    );
    const conds = [
      ...this.filterConditions(scope, this.baseFilters(spec.filters)),
      ...innerConditions,
    ];
    const where = conds.length ? ` where ${conds.join(" and ")}` : "";
    const from = `${ident(table.schema)}.${ident(table.name)} ${scope.alias}`;
    const text = `select coalesce(json_agg(_r), '[]'::json) as data from (select ${list} from ${from}${where}${this.orderLimit(scope, spec)}) _r`;
    const compiled: Compiled = { text, params: this.params.list };
    if (spec.count) {
      // Same select list so the statement references exactly the same parameters.
      compiled.countText = `select count(*)::bigint as count from (select ${list} from ${from}${where}) _c`;
      compiled.countParams = this.params.list;
    }
    return compiled;
  }

  private returningSelect(
    spec: QuerySpec,
    table: TableInfo,
    cte: string,
  ): Promise<string> {
    const scope: Scope = { table, alias: this.nextAlias() };
    return this.selectList(scope, parseSelect(spec.columns), []).then(
      ({ list }) =>
        `select coalesce(json_agg(_r), '[]'::json) as data from (select ${list} from ${cte} ${scope.alias}${this.orderLimit(scope, { ...spec, offset: undefined, limit: undefined })}) _r`,
    );
  }

  private async compileInsert(spec: QuerySpec): Promise<Compiled> {
    const table = await this.table(spec.schema, spec.table);
    const rows = (
      Array.isArray(spec.values) ? spec.values : [spec.values ?? {}]
    ) as Record<string, unknown>[];
    if (rows.length === 0)
      return { text: "select '[]'::json as data", params: [] };
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const types = columns.map((c) => this.columnType(table, c));
    const target = `${ident(table.schema)}.${ident(table.name)}`;
    let sql: string;
    if (columns.length === 0) {
      sql = `insert into ${target} default values`;
    } else {
      const values = rows
        .map(
          (row) =>
            `(${columns
              .map((c, i) =>
                Object.prototype.hasOwnProperty.call(row, c)
                  ? this.params.add(row[c], types[i])
                  : spec.defaultToNull === false
                    ? "default"
                    : "null",
              )
              .join(", ")})`,
        )
        .join(", ");
      sql = `insert into ${target} (${columns.map(ident).join(", ")}) values ${values}`;
    }
    if (spec.action === "upsert") {
      const conflict = spec.onConflict
        ? spec.onConflict
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : table.primaryKey;
      if (!conflict.length)
        throw new CompileError("upsert needs onConflict or a primary key");
      conflict.forEach((c) => this.columnType(table, c));
      const updates = columns.filter((c) => !conflict.includes(c));
      sql +=
        spec.ignoreDuplicates || updates.length === 0
          ? ` on conflict (${conflict.map(ident).join(", ")}) do nothing`
          : ` on conflict (${conflict.map(ident).join(", ")}) do update set ${updates
              .map((c) => `${ident(c)} = excluded.${ident(c)}`)
              .join(", ")}`;
    }
    if (!spec.returning)
      return { text: sql, params: this.params.list, minimal: true };
    const text = `with _m as (${sql} returning *) ${await this.returningSelect(spec, table, "_m")}`;
    return { text, params: this.params.list };
  }

  private async compileUpdate(spec: QuerySpec): Promise<Compiled> {
    const table = await this.table(spec.schema, spec.table);
    const scope: Scope = { table, alias: this.nextAlias() };
    const values = (spec.values ?? {}) as Record<string, unknown>;
    const columns = Object.keys(values);
    if (!columns.length)
      throw new CompileError("update() needs at least one column");
    const set = columns
      .map(
        (c) =>
          `${ident(c)} = ${this.params.add(values[c], this.columnType(table, c))}`,
      )
      .join(", ");
    if (spec.filters.some((f) => f.kind !== "or" && f.column.includes(".")))
      throw new CompileError(
        "Filters on embedded tables are not supported in update()",
      );
    const conds = this.filterConditions(scope, spec.filters);
    const where = conds.length ? ` where ${conds.join(" and ")}` : "";
    const sql = `update ${ident(table.schema)}.${ident(table.name)} as ${scope.alias} set ${set}${where}`;
    if (!spec.returning)
      return { text: sql, params: this.params.list, minimal: true };
    const text = `with _m as (${sql} returning ${scope.alias}.*) ${await this.returningSelect(spec, table, "_m")}`;
    return { text, params: this.params.list };
  }

  private async compileDelete(spec: QuerySpec): Promise<Compiled> {
    const table = await this.table(spec.schema, spec.table);
    const scope: Scope = { table, alias: this.nextAlias() };
    if (spec.filters.some((f) => f.kind !== "or" && f.column.includes(".")))
      throw new CompileError(
        "Filters on embedded tables are not supported in delete()",
      );
    const conds = this.filterConditions(scope, spec.filters);
    const where = conds.length ? ` where ${conds.join(" and ")}` : "";
    const sql = `delete from ${ident(table.schema)}.${ident(table.name)} as ${scope.alias}${where}`;
    if (!spec.returning)
      return { text: sql, params: this.params.list, minimal: true };
    const text = `with _m as (${sql} returning ${scope.alias}.*) ${await this.returningSelect(spec, table, "_m")}`;
    return { text, params: this.params.list };
  }

  private async compileRpc(spec: QuerySpec): Promise<Compiled> {
    if (!ALLOWED_SCHEMAS.has(spec.schema))
      throw new CompileError("Schema is not exposed", "PGRST106");
    const name = spec.fn ?? "";
    ident(name);
    const args = spec.args ?? {};
    const given = Object.keys(args);
    given.forEach(ident);
    const candidates = (await this.lookup.functions(name)).filter((f) => {
      if (!given.every((g) => f.argNames.includes(g))) return false;
      const required = f.argNames.slice(0, f.requiredArgs);
      return required.every((r) => given.includes(r));
    });
    if (candidates.length === 0)
      throw new CompileError(
        `Could not find the function public.${name}(${given.join(", ")}) in the schema cache`,
        "PGRST202",
        404,
      );
    candidates.sort((a, b) => a.argNames.length - b.argNames.length);
    const fn = candidates[0]!;
    const argSql = given
      .map(
        (g) =>
          `${ident(g)} => ${this.params.add(args[g], fn.argTypes[fn.argNames.indexOf(g)])}`,
      )
      .join(", ");
    const call = `${ident(fn.schema)}.${ident(fn.name)}(${argSql})`;
    const isRowType = fn.returnsTable || fn.returnKind === "c";
    if (fn.returnsSet || isRowType) {
      if (!isRowType) {
        return {
          text: `select coalesce(json_agg(_t."v"), '[]'::json) as data from ${call} as _t("v")`,
          params: this.params.list,
        };
      }
      // Set-returning functions support simple filters/order/limit like a table. Result
      // column types are not in the catalog, so filters compare as text.
      const scope: Scope = {
        table: { schema: "public", name, columns: new Map(), primaryKey: [] },
        alias: this.nextAlias(),
      };
      const items = parseSelect(spec.columns);
      const list = items
        .map((i) => {
          if (i.kind === "star") return `${scope.alias}.*`;
          if (i.kind === "column")
            return `${scope.alias}.${ident(i.name)} as ${ident(i.alias ?? i.name)}`;
          throw new CompileError("Embedding is not supported on rpc()");
        })
        .join(", ");
      const conds = this.filterConditionsLoose(scope, spec.filters);
      const where = conds.length ? ` where ${conds.join(" and ")}` : "";
      const inner = `select ${list} from ${call} ${scope.alias}${where}${this.orderLoose(scope, spec)}`;
      if (!fn.returnsSet && !spec.columns && !spec.filters.length)
        return {
          text: `select to_json(_r) as data from (${inner}) _r`,
          params: this.params.list,
          scalar: true,
        };
      return {
        text: `select coalesce(json_agg(_r), '[]'::json) as data from (${inner}) _r`,
        params: this.params.list,
      };
    }
    if (fn.returnType === "void")
      return {
        text: `select null::json as data from (select ${call}) _x`,
        params: this.params.list,
        scalar: true,
      };
    return {
      text: `select to_json(${call}) as data`,
      params: this.params.list,
      scalar: true,
    };
  }

  /** Filters on rpc results: column types are unknown, so values are bound untyped. */
  private filterConditionsLoose(scope: Scope, filters: Filter[]): string[] {
    return filters.map((f) => {
      if (
        f.kind !== "op" ||
        !["eq", "neq", "gt", "gte", "lt", "lte", "is", "in"].includes(f.op)
      )
        throw new CompileError("Only simple filters are supported on rpc()");
      const col = `${scope.alias}.${ident(f.column)}`;
      if (f.op === "is")
        return `${col} is ${f.value === null ? "null" : f.value ? "true" : "false"}`;
      if (f.op === "in") {
        const list = Array.isArray(f.value) ? f.value : [];
        return list.length
          ? `${col}::text in (${list.map((v) => this.params.add(v, "text")).join(", ")})`
          : "false";
      }
      const sym = {
        eq: "=",
        neq: "<>",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
      }[f.op as "eq"];
      return `${col}::text ${sym} ${this.params.add(f.value, "text")}`;
    });
  }

  private orderLoose(scope: Scope, spec: QuerySpec): string {
    const order = spec.order.map(
      (o) =>
        `${scope.alias}.${ident(o.column)} ${o.ascending ? "asc" : "desc"}`,
    );
    let sql = order.length ? ` order by ${order.join(", ")}` : "";
    if (spec.limit !== undefined) sql += ` limit ${int(spec.limit)}`;
    if (spec.offset !== undefined) sql += ` offset ${int(spec.offset)}`;
    return sql;
  }
}

function embeddedName(column: string): string | undefined {
  const dot = column.indexOf(".");
  return dot > 0 ? column.slice(0, dot) : undefined;
}

function int(n: number): number {
  if (!Number.isInteger(n) || n < 0)
    throw new CompileError("limit/offset must be a non-negative integer");
  return n;
}

const OPS: FilterOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "cs",
  "cd",
];
function isFilterOp(op: string): op is FilterOp {
  return (OPS as string[]).includes(op);
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1).replace(/\\(.)/g, "$1");
  return value;
}

/** "(a,b,"c,d")" → ["a","b","c,d"] */
export function parseList(value: string): string[] {
  const v = value.trim();
  if (!v.startsWith("(") || !v.endsWith(")"))
    throw new CompileError("in() list must be (a,b,…)");
  const inner = v.slice(1, -1);
  if (!inner.trim()) return [];
  return splitTop(inner).map(unquote);
}

function parseContainer(value: string): unknown {
  const v = value.trim();
  if (v.startsWith("{") && v.endsWith("}")) {
    // Postgres array literal: keep as text, cast by column type
    const inner = v.slice(1, -1);
    return inner ? splitTop(inner).map(unquote) : [];
  }
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
