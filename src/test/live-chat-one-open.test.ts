// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; status: string; visitor_id: string };

const db = vi.hoisted(() => ({
  chats: [] as Row[],
  /** Simulates a concurrent request that opens the chat just before this insert. */
  raceWinner: null as Row | null,
  messages: [] as unknown[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const chain = {
      middleware: () => chain,
      inputValidator: (validator: typeof validate) => {
        validate = validator;
        return chain;
      },
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data: unknown }) =>
          handler({
            data: validate(args?.data),
            context: { userId: "admin", claims: { email: "a@e20e.tools" } },
          }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.com/"),
}));
vi.mock("@/lib/admin-guard.server", () => ({
  requireAdmin: async () => undefined,
  actorEmail: () => "a@e20e.tools",
}));

function chatsTable() {
  const filters: ((row: Row) => boolean)[] = [];
  const rows = () => db.chats.filter((row) => filters.every((f) => f(row)));
  const chain = {
    select: () => chain,
    eq: (column: keyof Row, value: string) => {
      filters.push((row) => row[column] === value);
      return chain;
    },
    neq: (column: keyof Row, value: string) => {
      filters.push((row) => row[column] !== value);
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: (row: { visitor_id: string }) => ({
      select: () => ({
        single: async () => {
          if (db.raceWinner) {
            db.chats.push(db.raceWinner);
            db.raceWinner = null;
          }
          const open = db.chats.some(
            (c) => c.visitor_id === row.visitor_id && c.status !== "closed",
          );
          if (open)
            return { data: null, error: { code: "23505", message: "dup" } };
          const created = {
            id: "new-chat",
            status: "ai",
            visitor_id: row.visitor_id,
          };
          db.chats.push(created);
          return { data: created, error: null };
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        db.updates.push(patch);
        return { error: null };
      },
    }),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === "live_chats"
        ? chatsTable()
        : {
            insert: async (rows: unknown[]) => {
              db.messages.push(...rows);
              return { error: null };
            },
          },
  },
}));

import { openChatFor } from "@/lib/live-chat.server";
import { adminSendLiveMessage } from "@/lib/live-chat.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const visitor = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "v@example.com",
  name: "V",
  language: "en",
};
const closedId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  db.chats = [];
  db.raceWinner = null;
  db.messages = [];
  db.updates = [];
});

describe("one open chat per visitor", () => {
  it("creates a chat when the visitor has none open", async () => {
    await expect(openChatFor(supabaseAdmin, visitor)).resolves.toMatchObject({
      id: "new-chat",
    });
  });

  it("joins the chat a simultaneous request just opened instead of failing", async () => {
    db.raceWinner = { id: "winner", status: "ai", visitor_id: visitor.id };
    await expect(openChatFor(supabaseAdmin, visitor)).resolves.toMatchObject({
      id: "winner",
    });
    expect(db.chats.filter((c) => c.status !== "closed")).toHaveLength(1);
  });

  it("an admin reply does not reopen an old chat while a newer one is open", async () => {
    db.chats = [
      { id: closedId, status: "closed", visitor_id: visitor.id },
      { id: "open-now", status: "ai", visitor_id: visitor.id },
    ];
    await expect(
      adminSendLiveMessage({ data: { chatId: closedId, body: "Hello" } }),
    ).rejects.toThrow("newer chat open");
    expect(db.messages).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("an admin reply still reopens a closed chat when nothing else is open", async () => {
    db.chats = [{ id: closedId, status: "closed", visitor_id: visitor.id }];
    await expect(
      adminSendLiveMessage({ data: { chatId: closedId, body: "Hello" } }),
    ).resolves.toEqual({ ok: true });
    expect(db.updates[0]).toMatchObject({ status: "active" });
  });
});
