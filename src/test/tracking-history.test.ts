// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  identity: null as null | { kind: "guest" | "account"; id: string; email: string },
  owned: true,
  rows: 0,
  ranges: [] as [number, number][],
  ownerFilters: [] as [string, string][],
  messageReads: 0,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const b = {
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => async (args?: { data: unknown }) =>
        fn({ data: validate(args?.data) }),
    };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers() }) }));
vi.mock("@/lib/request-identity.server", () => ({
  resolveRequestIdentity: async () => state.identity,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          if (table === "live_chats") state.ownerFilters.push([column, value]);
          return chain;
        },
        order: () => chain,
        maybeSingle: async () => ({ data: state.owned ? { id: "c" } : null, error: null }),
        range: async (from: number, to: number) => {
          state.messageReads++;
          state.ranges.push([from, to]);
          const count = Math.max(0, Math.min(to - from + 1, state.rows - from));
          return {
            data: Array.from({ length: count }, (_, i) => ({
              id: `m${from + i}`,
              chat_id: "c",
              sender: "visitor",
              body: `message ${from + i}`,
              created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 10_000 - (from + i))).toISOString(),
            })),
            error: null,
          };
        },
      };
      return chain;
    },
  },
}));
import { getMyChatHistory } from "@/lib/tracking.functions";

const chatId = "8a3e6a52-0f0e-4c55-9a4e-0d6f7b1f2a11";
beforeEach(() => {
  state.identity = { kind: "guest", id: "guest-uuid", email: "x@example.com" };
  state.owned = true;
  state.rows = 0;
  state.ranges = [];
  state.ownerFilters = [];
  state.messageReads = 0;
});

it("refuses history without a verified identity and reads no messages", async () => {
  state.identity = null;
  expect((await getMyChatHistory({ data: { access: "", chatId } })).status).toBe("unauthorized");
  expect(state.messageReads).toBe(0);
});

it("checks chat ownership by verified visitor ID before reading messages", async () => {
  state.owned = false;
  expect((await getMyChatHistory({ data: { access: "signed", chatId } })).status).toBe("not_found");
  expect(state.ownerFilters).toContainEqual(["id", chatId]);
  expect(state.ownerFilters).toContainEqual(["visitor_id", "guest-uuid"]);
  expect(state.messageReads).toBe(0);
});

it("pages older conversations 50 messages at a time beyond the old 200-message cap", async () => {
  state.rows = 260;
  const pages = [];
  let offset = 0;
  for (;;) {
    const page = await getMyChatHistory({ data: { access: "signed", chatId, offset } });
    if (page.status !== "ok") throw new Error("expected ok");
    pages.push(page);
    if (!page.hasMore) break;
    offset = page.nextOffset;
  }
  expect(pages).toHaveLength(6);
  expect(pages.map((page) => page.messages.length)).toEqual([50, 50, 50, 50, 50, 10]);
  expect(new Set(pages.flatMap((page) => page.messages.map((m) => m.id))).size).toBe(260);
  expect(pages[0]!.messages.at(-1)!.id).toBe("m0"); // newest message ends the first page
});

it("rejects malformed chat IDs before any store access", async () => {
  await expect(getMyChatHistory({ data: { access: "signed", chatId: "x" } })).rejects.toThrow();
  expect(state.ownerFilters).toHaveLength(0);
});
