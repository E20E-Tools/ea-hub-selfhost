// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  visitor: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "same@example.com",
    name: "Guest",
  } as { id: string; email: string; name: string } | null,
  admin: true,
  access: [] as string[],
  filters: [] as [string, string, unknown][],
  messages: Array.from({ length: 205 }, (_, i) => ({
    id: String(i),
    chat_id: "22222222-2222-4222-8222-222222222222",
    body: `reply ${i}`,
    sender: "admin",
    created_at: String(i),
  })).reverse(),
  key: "test-fixture-only",
  reads: 0,
  writes: 0,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const b = {
      middleware: () => b,
      inputValidator: (v: typeof validate) => {
        validate = v;
        return b;
      },
      handler: (h: (a: unknown) => unknown) => async (a?: { data: unknown }) =>
        h({ data: validate(a?.data), context: { userId: "admin", claims: {} } }),
    };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://example.com", { headers: { "sec-fetch-site": "same-origin" } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/admin-guard.server", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("Forbidden");
  },
}));
vi.mock("@/lib/live-chat.server", () => ({
  verifyVisitor: async (_: unknown, access: string) => {
    state.access.push(access);
    return state.visitor;
  },
  adminClient: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
}));
vi.mock("@/lib/server-keys.server", () => ({
  isEncrypted: () => true,
  encryptSecret: async () => "encrypted-fixture",
  decryptSecret: async () => state.key,
  openSecret: async () => ({ plain: state.key, rewrap: false }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.reads++;
      const filters: Record<string, unknown> = {};
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          state.filters.push([table, k, v]);
          return b;
        },
        order: () => b,
        limit: async () => ({
          data: [
            { id: "request-A", request_type: "support", status: "new", created_at: "2026-11-13" },
          ],
          error: null,
        }),
        range: async (start: number, end: number) => ({
          data:
            table === "live_chats"
              ? [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    status: "active",
                    created_at: "2026-11-13",
                    last_message_at: "2026-11-13",
                  },
                ]
              : state.messages.slice(start, end + 1),
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            table === "live_chats"
              ? filters["visitor_id"] === "wrong"
                ? null
                : { id: filters["id"] }
              : table === "live_chat_ratings"
                ? { stars: 4, comment: "Saved comment" }
                : { api_key: state.key, base_url: "https://api.groq.com/openai/v1" },
          error: null,
        }),
        upsert: async () => {
          state.writes++;
          return { error: null };
        },
      };
      return b;
    },
  },
}));
import { adminChatVisitorSupport, readVisitorChats } from "@/lib/live-chat.functions";
import { readVisitorRating } from "@/lib/chat-feedback.functions";
import { getAiSettings, saveAiSettings } from "@/lib/ai-settings.functions";
const chatId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  state.visitor = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "same@example.com",
    name: "Guest",
  };
  state.admin = true;
  state.filters = [];
  state.access = [];
  state.reads = 0;
  state.writes = 0;
});
it("support details filter by stored chat ID and never typed-email wildcards", async () => {
  await adminChatVisitorSupport({ data: { chatId } });
  expect(state.filters).toEqual([["suggestion_requests", "details->>chatId", chatId]]);
  state.admin = false;
  const reads = state.reads;
  await expect(adminChatVisitorSupport({ data: { chatId } })).rejects.toThrow("Forbidden");
  expect(state.reads).toBe(reads);
});
it("current chat retrieves latest messages independently of an older 500-message chat and paginates all 205", async () => {
  const first = await readVisitorChats({ data: { access: "signed", chatId } });
  expect(first.messages[99]?.body).toBe("reply 204");
  expect(first.messages[0]?.body).toBe("reply 105");
  expect(first.hasMore).toBe(true);
  const next = await readVisitorChats({ data: { access: "signed", chatId, offset: 100 } });
  const last = await readVisitorChats({ data: { access: "signed", chatId, offset: 200 } });
  expect(last.hasMore).toBe(false);
  expect(
    new Set([...first.messages, ...next.messages, ...last.messages].map((m) => m.id)).size,
  ).toBe(205);
  expect(state.filters).toContainEqual(["live_chats", "visitor_id", state.visitor?.id]);
  expect(state.filters).toContainEqual(["live_chat_messages", "chat_id", chatId]);
});
it("chat list reads do not download messages", async () => {
  const result = await readVisitorChats({ data: { access: "signed" } });
  expect(result.messages).toEqual([]);
  expect(state.reads).toBe(1);
});
it("saved guest rating reloads through signed identity and rejects another guest", async () => {
  expect(await readVisitorRating({ data: { access: "signed", chatId } })).toEqual({
    stars: 4,
    comment: "Saved comment",
  });
  expect(state.access).toEqual(["signed"]);
  state.visitor = { id: "wrong", email: "same@example.com", name: "Other" };
  state.filters = [];
  expect(await readVisitorRating({ data: { access: "other", chatId } })).toBeNull();
  expect(state.filters.some(([table]) => table === "live_chat_ratings")).toBe(false);
});
it("invalid guest access cannot read chats or ratings", async () => {
  state.visitor = null;
  expect((await readVisitorChats({ data: { access: "forged", chatId } })).chats).toEqual([]);
  expect(await readVisitorRating({ data: { access: "forged", chatId } })).toBeNull();
  expect(state.reads).toBe(0);
});
it("conflicting provider key removal and replacement fails before any read/write", async () => {
  await expect(
    saveAiSettings({
      data: {
        baseUrl: "https://custom.example.com/v1",
        model: "model",
        speed: "balanced",
        apiKey: "fixture",
        removeKey: true,
      },
    }),
  ).rejects.toThrow();
  expect(state.reads).toBe(0);
  expect(state.writes).toBe(0);
});
it("AI settings expose fixed key presence only", async () => {
  expect((await getAiSettings()).keyHint).toBe("••••");
  state.admin = false;
  await expect(getAiSettings()).rejects.toThrow("Forbidden");
});
