// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  Compiler,
  encodeValue,
  parseList,
  parseSelect,
  type CatalogLookup,
} from "../server/compile";
import { fromTable } from "../supabase-js/builder";
import type { QuerySpec } from "../supabase-js/spec";

const tables: Record<string, Record<string, string>> = {
  chats: {
    id: "uuid",
    visitor_id: "uuid",
    status: "text",
    created_at: "timestamp with time zone",
  },
  messages: {
    id: "uuid",
    chat_id: "uuid",
    body: "text",
    tags: "text[]",
    meta: "jsonb",
  },
};
const lookup: CatalogLookup = {
  table: async (_s, name) =>
    tables[name]
      ? {
          schema: "public",
          name,
          columns: new Map(Object.entries(tables[name]!)),
          primaryKey: ["id"],
        }
      : undefined,
  relations: async () => [
    {
      from: "messages",
      fromColumns: ["chat_id"],
      to: "chats",
      toColumns: ["id"],
      constraint: "messages_chat_id_fkey",
    },
  ],
  functions: async (name) =>
    name === "has_role"
      ? [
          {
            schema: "public",
            name,
            argNames: ["_user_id", "_role"],
            argTypes: ["uuid", "app_role"],
            requiredArgs: 2,
            returnsSet: false,
            returnType: "boolean",
            returnKind: "b",
            returnsTable: false,
          },
        ]
      : [],
};

function spec(
  build: (b: ReturnType<typeof fromTable>) => unknown,
  table = "messages",
): QuerySpec {
  let captured: QuerySpec | undefined;
  const b = fromTable(async (s) => {
    captured = s;
    return {
      data: null,
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
  }, table);
  build(b);
  return captured ?? b.toSpec();
}

describe("self-host SQL compiler", () => {
  it("binds every value as a typed parameter", async () => {
    const c = await new Compiler(lookup).compile(
      spec((b) =>
        b
          .select("id, body")
          .eq("chat_id", "x'; drop table x;--")
          .in("id", ["a", "b"])
          .order("body", { ascending: false })
          .range(10, 19),
      ),
    );
    expect(c.text).toContain('"chat_id" = $1::uuid');
    expect(c.text).toContain('"id" in ($2::uuid, $3::uuid)');
    expect(c.text).toContain("limit 10 offset 10");
    expect(c.params[0]).toBe("x'; drop table x;--");
  });

  it("rejects unknown columns and odd identifiers", async () => {
    await expect(
      new Compiler(lookup).compile(spec((b) => b.select("nope"))),
    ).rejects.toThrow(/nope/);
    await expect(
      new Compiler(lookup).compile(spec((b) => b.select("id; drop"))),
    ).rejects.toThrow(/Invalid identifier/);
    await expect(
      new Compiler(lookup).compile(spec((b) => b.select("*"), "pg_authid")),
    ).rejects.toThrow(/schema cache/);
  });

  it("parses PostgREST or() strings with nesting and wildcards", async () => {
    const c = await new Compiler(lookup).compile(
      spec((b) =>
        b
          .select("id")
          .or("body.ilike.*hi*,and(chat_id.eq.1,id.not.in.(2,3)),body.is.null"),
      ),
    );
    expect(c.text).toMatch(
      /"body"::text ilike \$1::text or \(.*"chat_id" = \$2::uuid and not \(.*"id" in \(\$3::uuid, \$4::uuid\)\)\) or .*"body" is null/,
    );
    expect(c.params[0]).toBe("%hi%");
  });

  it("embeds many-to-one relations with !inner filters", async () => {
    const c = await new Compiler(lookup).compile(
      spec((b) =>
        b.select("id,chats!inner(visitor_id)").eq("chats.visitor_id", "v"),
      ),
    );
    expect(c.text).toContain("to_json(_e)");
    expect(c.text).toContain('exists (select 1 from "public"."chats"');
    expect(c.text).toContain('"visitor_id" = $1::uuid');
  });

  it("inserts with defaults for missing keys only when asked", async () => {
    const c = await new Compiler(lookup).compile(
      spec((b) =>
        b.insert([{ id: "1", body: "a" }, { id: "2" }], {
          defaultToNull: false,
        }),
      ),
    );
    expect(c.text).toContain(
      "values ($1::uuid, $2::text), ($3::uuid, default)",
    );
    expect(c.minimal).toBe(true);
  });

  it("upserts on the primary key and returns rows when selected", async () => {
    const c = await new Compiler(lookup).compile(
      spec((b) => b.upsert({ id: "1", body: "a" }).select("id")),
    );
    expect(c.text).toContain(
      'on conflict ("id") do update set "body" = excluded."body"',
    );
    expect(c.text).toContain("returning *");
  });

  it("encodes arrays and json like PostgREST", () => {
    expect(encodeValue(["a", 'b"c'], "text[]")).toBe('{"a","b\\"c"}');
    expect(encodeValue({ a: 1 }, "jsonb")).toBe('{"a":1}');
    expect(encodeValue("x", "jsonb")).toBe('"x"');
    expect(parseList('(a,"b,c")')).toEqual(["a", "b,c"]);
    expect(parseSelect("a, rel!inner(b, c)")).toHaveLength(2);
  });

  it("calls functions with named, typed arguments", async () => {
    const c = await new Compiler(lookup).compile({
      schema: "public",
      action: "rpc",
      fn: "has_role",
      args: { _user_id: "u", _role: "admin" },
      returning: false,
      filters: [],
      order: [],
    });
    expect(c.text).toBe(
      'select to_json("public"."has_role"("_user_id" => $1::uuid, "_role" => $2::app_role)) as data',
    );
    expect(c.scalar).toBe(true);
  });
});
