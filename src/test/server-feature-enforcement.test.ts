// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: { feature_flags: {} } as { feature_flags: unknown } | null,
  error: null as { message: string } | null,
  throws: false,
  reads: 0,
  inserts: [] as string[],
  providerCalls: 0,
  quotaCalls: 0,
  challenges: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      expect(table).toBe("site_settings");
      return {
        select: (columns: string) => {
          expect(columns).toBe("feature_flags");
          return {
            eq: (column: string, value: boolean) => {
              expect([column, value]).toEqual(["id", true]);
              return {
                maybeSingle: async () => {
                  state.reads++;
                  if (state.throws) throw new Error("transport failed");
                  return { data: state.settings, error: state.error };
                },
              };
            },
          };
        },
      };
    },
  }),
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
      handler: (handler: (args: unknown) => unknown) => async (args?: { data: unknown }) =>
        handler({
          data: validate(args?.data),
          context: {
            supabase: {
              auth: {
                getUser: async () => ({
                  data: {
                    user: { email: "visitor@example.com", email_confirmed_at: "2026-01-01" },
                  },
                }),
              },
            },
          },
        }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: vi.fn(),
  getRequest: () =>
    new Request("https://example.com/", { headers: { "sec-fetch-site": "same-origin" } }),
}));
vi.mock("@/lib/recommend-guard.server", () => ({ guardRecommendation: () => null }));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "192.0.2.1",
  hashSubject: async () => "hashed-subject",
  retryTime: async () => 0,
  consumeLimits: async () => {
    state.quotaCalls++;
    return true;
  },
  checkLimits: async () => {
    state.quotaCalls++;
    return "ok";
  },
  noteBudgetUsage: async () => undefined,
}));
vi.mock("@/lib/assistant-gate.server", () => ({
  registrationBrowser: async () => "test-browser",
  gateSecret: async () => "mock-secret",
  gateSecrets: async () => ["mock-secret"],
  challengeSigned: async () => true,
  verifyAccessToken: async () => ({
    email: "visitor@example.com",
    name: "Visitor",
    visitorId: "11111111-1111-4111-8111-111111111111",
  }),
  verifyChallenge: async () => true,
  issueAccessToken: async () => ({ token: "mock-token", exp: 9999999999 }),
  issueChallenge: async () => {
    state.challenges++;
    return { token: "challenge", question: "1 + 1" };
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc:async (name:string)=>{
      if(name!=="register_archy_guest")throw Error("Unexpected function");
      state.inserts.push("assistant_registrations");return {data:0,error:null};
    },
    from: (table: string) => {
      const chain = {
        insert: async () => {
          state.inserts.push(table);
          return { error: null };
        },
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        gte: async () => ({ count: 0, error: null }),
        order: () => chain,
        // Awaitable list result that also supports the open-chat maybeSingle lookup.
        limit: () =>
          Object.assign(Promise.resolve({ data: [], error: null }), {
            maybeSingle: async () => ({ data: null, error: null }),
          }),
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/recommend.server", () => ({
  runAssistantChat: async () => {
    state.providerCalls++;
    return { answer:{summary: "mock reply", picks: []},source:"local",model:"test-model" };
  },
  recommendProducts: async () => {
    state.providerCalls++;
    return { summary: "mock recommendation", picks: [] };
  },
}));

import {
  getAssistantChallenge,
  registerAssistantVisitor,
  sendAssistantMessage,
} from "@/lib/assistant-chat.functions";
import { recommendTools } from "@/lib/recommend.functions";
import { serverFeatureEnabled } from "@/lib/site-features.server";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.com");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  Object.assign(state, {
    settings: { feature_flags: { assistant: true, recommendations: true } },
    error: null,
    throws: false,
    reads: 0,
    inserts: [],
    providerCalls: 0,
    quotaCalls: 0,
    challenges: 0,
  });
});
afterEach(() => vi.unstubAllEnvs());

const endpoints = [
  {
    name: "assistant messages",
    key: "assistant",
    call: () =>
      sendAssistantMessage({
        data: {
          turns: [{ role: "user", content: "Find a technology tool" }],
          language: "en",
          access: "token",
        },
      }),
    inserts: ["live_chats"],
    calls: 1,
  },
  {
    name: "assistant registration",
    key: "assistant",
    call: () =>
      registerAssistantVisitor({
        data: {
          name: "Visitor",
          email: "visitor@example.com",
          question: "Find a tool",
          token: "challenge",
          answer: "2",
          website: "",
          language: "en",
        },
      }),
    inserts: ["assistant_registrations"],
    calls: 0,
  },
  {
    name: "recommendations",
    key: "recommendations",
    call: () => recommendTools({ data: { need: "Find a technology tool", language: "en" } }),
    inserts: [],
    calls: 1,
  },
] as const;

for (const endpoint of endpoints) {
  describe(endpoint.name, () => {
    for (const mode of ["disabled", "lookup error", "thrown lookup", "missing row"] as const) {
      it(`${mode} blocks all provider calls, registration inserts and quotas`, async () => {
        if (mode === "disabled") state.settings = { feature_flags: { [endpoint.key]: false } };
        if (mode === "lookup error") state.error = { message: "unavailable" };
        if (mode === "thrown lookup") state.throws = true;
        if (mode === "missing row") state.settings = null;
        expect((await endpoint.call()).ok).toBe(false);
        expect(state.reads).toBe(1);
        expect(state.providerCalls).toBe(0);
        expect(state.inserts).toEqual([]);
        expect(state.quotaCalls).toBe(0);
      });
    }

    for (const mode of ["explicitly enabled", "missing key defaults"] as const) {
      it(`${mode} preserves the successful flow`, async () => {
        if (mode === "missing key defaults") state.settings = { feature_flags: {} };
        expect((await endpoint.call()).ok).toBe(true);
        expect(state.reads).toBe(1);
        expect(state.providerCalls).toBe(endpoint.calls);
        expect(state.inserts).toEqual(endpoint.inserts);
        expect(state.quotaCalls).toBeGreaterThan(0);
      });
    }
  });
}

it("re-reads settings on each invocation so an admin disable takes immediate effect", async () => {
  expect(await serverFeatureEnabled("assistant")).toBe(true);
  state.settings = { feature_flags: { assistant: false } };
  expect(await serverFeatureEnabled("assistant")).toBe(false);
  expect(state.reads).toBe(2);
});

it.each([null, [], "enabled", false])("malformed flags %j fail closed", async (flags) => {
  state.settings = { feature_flags: flags };
  expect(await serverFeatureEnabled("assistant")).toBe(false);
});

it("missing server configuration fails closed without making a read", async () => {
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
  expect(await serverFeatureEnabled("recommendations")).toBe(false);
  expect(state.reads).toBe(0);
});

it("disabled assistant does not issue a registration challenge", async () => {
  state.settings = { feature_flags: { assistant: false } };
  await expect(getAssistantChallenge()).rejects.toThrow();
  expect(state.challenges).toBe(0);
  expect(state.inserts).toEqual([]);
});

it("enabled assistant can issue the registration challenge", async () => {
  await expect(getAssistantChallenge()).resolves.toMatchObject({ token: "challenge" });
  expect(state.challenges).toBe(1);
});
