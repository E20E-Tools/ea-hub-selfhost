// @vitest-environment node
// Second improvement batch: server behaviour with mocked transport and an in-memory data client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  eventCount: 0,
  telemetry: [] as { operation: string; outcome: string; created_at: string }[],
  rpcCalls: [] as string[],
  visitor: { id: "guest-1", name: "V", email: "Visitor@Example.com" },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["inputValidator"] = (v: unknown) => {
      chain["validator"] = v;
      return chain;
    };
    chain["middleware"] = () => chain;
    chain["handler"] =
      (h: (a: { data: unknown }) => unknown) =>
      async (args?: { data: unknown }) =>
        h({
          data: chain["validator"]
            ? (chain["validator"] as (x: unknown) => unknown)(args?.data)
            : undefined,
        } as never);
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@/lib/site-features.server", () => ({
  serverFeatureEnabled: async () => true,
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (key: string) => jar.get(key),
  setCookie: (key: string, value: string) => jar.set(key, value),
  setResponseHeader: vi.fn(),
  getRequest: () =>
    new Request("https://www.e20e.tools/", {
      headers: {
        "sec-fetch-site": "same-origin",
        "cf-connecting-ip": "198.51.100.7",
      },
    }),
}));
vi.mock("@/lib/live-chat.server", () => ({
  verifyVisitor: async () => m.visitor,
  adminClient: async () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq"]) q[k] = () => q;
    q["maybeSingle"] = async () => ({ data: null });
    return { from: () => q };
  },
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "gte", "in", "order", "limit"])
      q[k] = () => q;
    q["then"] = (resolve: (v: unknown) => void) =>
      resolve(
        table === "rate_limit_events"
          ? { count: m.eventCount, error: null }
          : { data: m.telemetry, error: null },
      );
    q["insert"] = async (row: Record<string, unknown>) => {
      m.inserts.push({ table, row });
      return { error: null };
    };
    return q;
  };
  return {
    supabaseAdmin: {
      from: query,
      rpc: async (
        name: string,
        args: { _bucket: string; _subject: string; _limit: number },
      ) => {
        if (name === "register_archy_guest") {
          m.inserts.push({
            table: "assistant_registrations",
            row: { ...args },
          });
          return { data: 0, error: null };
        }
        m.rpcCalls.push(`${name}:${args._bucket}`);
        const key = `${args._bucket}|${args._subject}`;
        const used = m.counts.get(key) ?? 0;
        if (used >= args._limit) return { data: false, error: null };
        m.counts.set(key, used + 1);
        return { data: true, error: null };
      },
    },
  };
});

import {
  getAssistantChallenge,
  registerAssistantVisitor,
} from "@/lib/assistant-chat.functions";
import { noteBudgetUsage } from "@/lib/rate-limit.server";
import { noteAiFailures } from "@/lib/telemetry.server";
import {
  requestHumanChat,
  sendVisitorLiveMessage,
} from "@/lib/live-chat.functions";
import { hashSubject } from "@/lib/rate-limit.server";

beforeEach(() => {
  m.counts.clear();
  m.inserts = [];
  m.eventCount = 0;
  m.telemetry = [];
  m.rpcCalls = [];
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-root");
  vi.stubEnv("TURNSTILE_SITE_KEY", "");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const register = (extra: Record<string, string>) =>
  registerAssistantVisitor({
    data: {
      name: "Khaled",
      email: "k@example.com",
      language: "en",
      website: "",
      ...extra,
    },
  } as never);

describe("2) registration challenge", () => {
  it("refuses a solved arithmetic token the second time it is used", async () => {
    const challenge = await getAssistantChallenge();
    expect(challenge.mode).toBe("math");
    if (challenge.mode !== "math") return;
    const answer = String(challenge.a + challenge.b);
    expect((await register({ token: challenge.token, answer })).ok).toBe(true);
    expect((await register({ token: challenge.token, answer })).ok).toBe(false);
    expect(
      m.inserts.filter((i) => i.table === "assistant_registrations"),
    ).toHaveLength(1);
  });
  it("burns the token on a wrong answer so it cannot be retried", async () => {
    const challenge = await getAssistantChallenge();
    if (challenge.mode !== "math") throw new Error("expected math mode");
    expect((await register({ token: challenge.token, answer: "99" })).ok).toBe(
      false,
    );
    const right = String(challenge.a + challenge.b);
    expect((await register({ token: challenge.token, answer: right })).ok).toBe(
      false,
    );
  });
  it("uses Turnstile with server-side siteverify when both keys are set", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    const fetcher = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getAssistantChallenge()).toEqual({
      mode: "turnstile",
      siteKey: "site-key",
      token: "",
    });
    expect((await register({ turnstile: "cf-token" })).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(Response.json({ success: false }));
    expect((await register({ turnstile: "cf-token" })).ok).toBe(false);
    expect((await register({ turnstile: "" })).ok).toBe(false);
  });
});

describe("3) 80% budget alert in the admin activity log", () => {
  it("logs once per day when the site-wide count reaches 80%", async () => {
    const day = new Date("2026-11-16T10:00:00Z");
    m.eventCount = 239;
    await noteBudgetUsage(
      "request:global-day",
      300,
      "request.global_limit_80",
      day,
    );
    expect(m.inserts).toEqual([]);
    m.eventCount = 240;
    await noteBudgetUsage(
      "request:global-day",
      300,
      "request.global_limit_80",
      day,
    );
    await noteBudgetUsage(
      "request:global-day",
      300,
      "request.global_limit_80",
      day,
    );
    expect(m.inserts).toEqual([
      {
        table: "admin_activity",
        row: expect.objectContaining({
          action: "request.global_limit_80",
          target: "240/300",
        }),
      },
    ]);
    await noteBudgetUsage(
      "request:global-day",
      300,
      "request.global_limit_80",
      new Date("2026-11-17T10:00:00Z"),
    );
    expect(m.inserts).toHaveLength(2);
  });
  it("keys live-chat limits by IP and email together", async () => {
    await requestHumanChat({
      data: { access: "token", language: "en" },
    } as never);
    await sendVisitorLiveMessage({
      data: {
        access: "token",
        chatId: "f8bcd11c-a841-40d4-a501-13b8f28d74ca",
        body: "hi",
      },
    } as never);
    const subject = await hashSubject("198.51.100.7|visitor@example.com");
    for (const bucket of ["live:request", "live:msg-min", "live:msg-day"]) {
      expect(m.counts.get(`${bucket}|${subject}`), bucket).toBe(1);
    }
  });
});

describe("12) AI failure event at most once an hour", () => {
  it("logs ai.failure_alert once while failures continue", async () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    m.telemetry = [1, 2, 3].map((i) => ({
      operation: "assistant",
      outcome: "failure",
      created_at: new Date(now - i * 60_000).toISOString(),
    }));
    await noteAiFailures(now);
    await noteAiFailures(now);
    expect(m.inserts.map((i) => i.row["action"])).toEqual(["ai.failure_alert"]);
  });
  it("logs nothing while answers succeed", async () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    m.telemetry = [
      {
        operation: "assistant",
        outcome: "success",
        created_at: new Date(now).toISOString(),
      },
    ];
    await noteAiFailures(now);
    expect(m.inserts).toEqual([]);
  });
});
