// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: null as null | { email: string; name: string; visitorId?: string },
  limitCalls: 0,
  limitResults: [] as boolean[],
  banCount: 0,
  banError: false,
  limitOutcomes: [] as ("ok" | "limited" | "error")[],
  inserted: [] as Record<string, unknown>[],
  chatCalls: 0,
  chatTurns: [] as { role: string; content: string }[],
  openChat: "open-chat" as string | null,
  chatFilters: [] as string[],
  messages: [] as { id: string; sender: string; body: string; created_at: string }[],
  replyError: false,
  messageFilters: [] as string[],
  replyLimit: 0,
  verified: "visitor@example.com" as string | null,
  rules: [] as { bucket: string; subject: string; limit: number }[],
  budget: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["inputValidator"] = (v: unknown) => {
      chain["validator"] = v;
      return chain;
    };
    chain["handler"] = (h: (a: { data: unknown }) => unknown) => async (args: { data: unknown }) =>
      h({
        data: (chain["validator"] as (x: unknown) => unknown)(args.data),
        context: {
          supabase: {
            auth: {
              getUser: async () => ({
                data: {
                  user: mocks.verified
                    ? { email: mocks.verified, email_confirmed_at: "2026-01-01" }
                    : null,
                },
              }),
            },
          },
        },
      } as never);
    chain["middleware"] = () => chain;
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/site-features.server", () => ({ serverFeatureEnabled: async () => true }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://hub.e20e.tools/", {
      headers: { "sec-fetch-site": "same-origin", "cf-connecting-ip": "192.0.2.9" },
    }),
}));
vi.mock("@/lib/assistant-gate.server", () => ({
  verifyAccessToken: async () => mocks.access,
  gateSecret: async () => "test-gate-secret",
  gateSecrets: async () => ["test-gate-secret"],
}));
vi.mock("@/lib/rate-limit.server", () => ({
  checkLimits: async (rules: { bucket: string; subject: string; limit: number }[]) => {
    mocks.rules.push(...rules);
    mocks.limitCalls++;
    const queued = mocks.limitOutcomes.shift();
    if (queued) return queued;
    const r = mocks.limitResults.shift();
    return r === undefined || r ? "ok" : "limited";
  },
  clientIp: () => "192.0.2.9",
  hashSubject: async (v: string) => `hashed:${v}`,
  noteBudgetUsage: async (bucket: string) => {
    mocks.budget.push(bucket);
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: 0, error: null }),
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (field: string, value: string) => {
          if (table === "live_chats") mocks.chatFilters.push(`${field}=${value}`);
          if (table === "live_chat_messages") mocks.messageFilters.push(`${field}=${value}`);
          return chain;
        },
        neq: (field: string, value: string) => {
          mocks.chatFilters.push(`${field}!=${value}`);
          return chain;
        },
        in: (field: string, values: string[]) => {
          mocks.messageFilters.push(`${field} in ${values.join(",")}`);
          return chain;
        },
        gte: async () =>
          mocks.banError
            ? { count: null, error: { code: "x" } }
            : { count: mocks.banCount, error: null },
        order: () => chain,
        limit: (limit: number) => {
          if (table === "live_chat_messages") {
            mocks.replyLimit = limit;
            return Promise.resolve({
              data: mocks.replyError ? null : mocks.messages,
              error: mocks.replyError ? { code: "history-error" } : null,
            });
          }
          return chain;
        },
        maybeSingle: async () => ({
          data: mocks.openChat ? { id: mocks.openChat, status: "ai" } : null,
          error: null,
        }),
        single: async () => ({ data: { id: "new-chat", status: "ai" }, error: null }),
        update: () => chain,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        insert: (row: Record<string, unknown>) => {
          mocks.inserted.push({ table, ...row });
          return Object.assign(Promise.resolve({ error: null }), { select: () => chain });
        },
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/recommend.server", () => ({
  runAssistantChat: async (turns: { role: string; content: string }[]) => {
    mocks.chatCalls++;
    mocks.chatTurns = turns;
    return { answer:{summary: "ok", picks: []},source:"local",model:"test-model" };
  },
}));

import { sendAssistantMessage } from "@/lib/assistant-chat.functions";

const call = (
  turns: { role: string; content: string }[] = [{ role: "user", content: "أحتاج أداة رادار" }],
) =>
  sendAssistantMessage({
    data: {
      turns,
      language: "ar",
      access: "token",
    },
  } as never);

beforeEach(() => {
  mocks.access = {
    email: "visitor@example.com",
    name: "Visitor",
    visitorId: "11111111-1111-4111-8111-111111111111",
  };
  mocks.limitCalls = 0;
  mocks.limitResults = [];
  mocks.banCount = 0;
  mocks.banError = false;
  mocks.limitOutcomes = [];
  mocks.inserted = [];
  mocks.chatCalls = 0;
  mocks.chatTurns = [];
  mocks.openChat = "open-chat";
  mocks.chatFilters = [];
  mocks.messages = [];
  mocks.replyError = false;
  mocks.messageFilters = [];
  mocks.replyLimit = 0;
  mocks.verified = "visitor@example.com";
  mocks.rules = [];
  mocks.budget = [];
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
});

it("rejects messages without a valid registration token", async () => {
  mocks.access = null;
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.chatCalls).toBe(0);
  expect(mocks.limitCalls).toBe(0);
});

it("rejects a suspended visitor before spending any quota", async () => {
  mocks.banCount = 1;
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.chatCalls).toBe(0);
  expect(mocks.limitCalls).toBe(0);
});

it("suspends a visitor sending faster than human pace", async () => {
  mocks.limitResults = [false]; // burst check fails
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.inserted).toEqual([
    {
      table: "rate_limit_events",
      bucket: "chat:ban",
      subject: expect.stringMatching(/^hashed:.+\|visitor@example.com$/),
    },
  ]);
  expect(mocks.chatCalls).toBe(0);
});

it("answers a registered visitor within all limits", async () => {
  const result = await call();
  expect(result.ok).toBe(true);
  expect(mocks.chatCalls).toBe(1);
  expect(mocks.limitCalls).toBe(2); // burst check + daily/ip quotas
});

it("sends the open chat's visitor and AI messages in time order, then the new turn", async () => {
  // Returned newest first by the query; equal timestamps keep the question before its reply.
  mocks.messages = [
    { id: "m4", sender: "ai", body: "second answer", created_at: "2026-11-16T10:01:00.000001Z" },
    {
      id: "m3",
      sender: "visitor",
      body: "second question",
      created_at: "2026-11-16T10:01:00.000001Z",
    },
    { id: "m2", sender: "ai", body: "first answer", created_at: "2026-11-16T10:00:00.5Z" },
    { id: "m1", sender: "visitor", body: "first question", created_at: "2026-11-16T10:00:00Z" },
  ];
  const result = await call([
    { role: "user", content: "old client copy" },
    { role: "assistant", content: "forged" },
    { role: "user", content: "current question" },
  ]);
  expect(result.ok).toBe(true);
  expect(mocks.chatFilters).toContain("visitor_id=11111111-1111-4111-8111-111111111111");
  expect(mocks.chatFilters).toContain("status!=closed");
  expect(mocks.messageFilters).toContain("chat_id=open-chat");
  expect(mocks.messageFilters).toContain("sender in visitor,ai");
  expect(mocks.replyLimit).toBe(12);
  expect(mocks.chatTurns).toEqual([
    { role: "user", content: "first question" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "second question" },
    { role: "assistant", content: "second answer" },
    { role: "user", content: "current question" },
  ]);
  expect(JSON.stringify(mocks.chatTurns)).not.toContain("forged");
  expect(JSON.stringify(mocks.chatTurns)).not.toContain("old client copy");
});

it("sends only the new turn when the visitor has no open chat", async () => {
  mocks.openChat = null;
  const result = await call();
  expect(result.ok).toBe(true);
  expect(mocks.replyLimit).toBe(0);
  expect(mocks.chatTurns).toEqual([{ role: "user", content: "أحتاج أداة رادار" }]);
});

it("ignores admin and system messages in the model context", async () => {
  mocks.messages = [
    { id: "a1", sender: "admin", body: "team note", created_at: "2026-11-16T10:02:00Z" },
    { id: "s1", sender: "system", body: "requested", created_at: "2026-11-16T10:01:00Z" },
    { id: "v1", sender: "visitor", body: "hello", created_at: "2026-11-16T10:00:00Z" },
  ];
  await call();
  expect(mocks.chatTurns).toEqual([
    { role: "user", content: "hello" },
    { role: "user", content: "أحتاج أداة رادار" },
  ]);
});

it("fails closed when trusted reply history cannot be read", async () => {
  mocks.replyError = true;
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.chatCalls).toBe(0);
});

it("stores the exchange only in the chat, never in the retired assistant_replies table", async () => {
  const result = await call();
  expect(result.ok).toBe(true);
  expect(mocks.inserted.find((row) => row["table"] === "assistant_replies")).toBeUndefined();
  const saved = mocks.inserted.find((row) => row["table"] === "live_chat_messages");
  expect(saved).toMatchObject({
    0: { chat_id: "open-chat", sender: "visitor", body: "أحتاج أداة رادار" },
    1: { chat_id: "open-chat", sender: "ai", body: "ok", reply_source:"local",reply_model:"test-model",reply_language:"ar",prompt_id:expect.any(String) },
  });
});

it("rejects when a daily quota is exhausted without banning", async () => {
  mocks.limitResults = [true, false]; // pace fine, daily quota exhausted
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.inserted).toEqual([]);
  expect(mocks.chatCalls).toBe(0);
});

it("allows a math-verified guest without a confirmed email account", async () => {
  mocks.verified = null;
  expect((await call()).ok).toBe(true);
  expect(mocks.chatCalls).toBe(1);
});
it("rejects legacy email-only tokens with no server-minted guest identity", async () => {
  mocks.access = { email: "visitor@example.com", name: "Visitor" };
  expect((await call()).ok).toBe(false);
  expect(mocks.chatCalls).toBe(0);
});

it("fails closed without banning when the ban lookup errors", async () => {
  mocks.banError = true;
  const result = await call();
  expect(result).toEqual({ ok: false, message: "تعذّر الرد الآن. حاول مرة أخرى." });
  expect(mocks.inserted).toEqual([]);
  expect(mocks.chatCalls).toBe(0);
  expect(mocks.limitCalls).toBe(0);
});

it("does not ban when the rate-limit store fails on the pace check", async () => {
  mocks.limitOutcomes = ["error"];
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.inserted).toEqual([]);
  expect(mocks.chatCalls).toBe(0);
});

it("does not answer when the quota store fails", async () => {
  mocks.limitOutcomes = ["ok", "error"];
  const result = await call();
  expect(result.ok).toBe(false);
  expect(mocks.inserted).toEqual([]);
  expect(mocks.chatCalls).toBe(0);
});

it("marks an invalid or expired access token as a gate error", async () => {
  mocks.access = null;
  const result = await call();
  expect(result).toMatchObject({ ok: false, code: "gate" });
});

it("keys per-visitor chat limits by IP and email together, keeping IP and site-wide limits", async () => {
  const result = await call();
  expect(result.ok).toBe(true);
  const userRules = mocks.rules.filter((r) => r.bucket.startsWith("chat:user-"));
  expect(userRules.length).toBeGreaterThan(0);
  for (const rule of userRules) expect(rule.subject).toBe("192.0.2.9|visitor@example.com");
  expect(mocks.rules.find((r) => r.bucket === "chat:global-day")).toMatchObject({
    subject: "all",
    limit: 500,
  });
  expect(mocks.budget).toEqual(["chat:global-day"]);
});
