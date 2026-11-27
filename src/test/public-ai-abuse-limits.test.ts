// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  site: "same-origin" as string | null,
  feature: true,
  pass: {
    kind: "access",
    email: "visitor@example.com",
    name: "Visitor",
    visitorId: "11111111-1111-4111-8111-111111111111",
  } as Record<string, unknown> | null,
  limited: new Set<string>(),
  buckets: [] as string[],
  generated: 0,
  challenges: 0,
  registrations: 0,
  turnstile: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const chain = {
      middleware: () => chain,
      inputValidator: (validator: unknown) => {
        validate =
          typeof validator === "function"
            ? (validator as typeof validate)
            : (value) =>
                (validator as { parse: (v: unknown) => unknown }).parse(value);
        return chain;
      },
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data: unknown }) =>
          handler({ data: validate(args?.data), context: {} }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: vi.fn(),
  getRequest: () =>
    new Request("https://example.com/", {
      headers: state.site ? { "sec-fetch-site": state.site } : {},
    }),
}));
vi.mock("@/lib/site-features.server", () => ({
  serverFeatureEnabled: async () => state.feature,
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "192.0.2.1",
  hashSubject: async () => "hashed-subject",
  consumeLimits: async (rules: { bucket: string }[]) => {
    for (const rule of rules) {
      state.buckets.push(rule.bucket);
      if (state.limited.has(rule.bucket)) return false;
    }
    return true;
  },
  checkLimits: async (rules: { bucket: string }[]) => {
    for (const rule of rules) {
      state.buckets.push(rule.bucket);
      if (state.limited.has(rule.bucket)) return "limited";
    }
    return "ok";
  },
  noteBudgetUsage: async () => undefined,
}));
vi.mock("@/lib/assistant-gate.server", () => ({
  registrationBrowser: async () => "test-browser",
  gateSecret: async () => "mock-secret",
  gateSecrets: async () => ["mock-secret"],
  challengeSigned: async () => true,
  verifyChallenge: async () => true,
  verifyAccessToken: async (_secrets: unknown, token: string) =>
    token === "valid-pass" ? state.pass : null,
  issueAccessToken: async () => ({ token: "mock-token", exp: 9999999999 }),
  issueChallenge: async () => {
    state.challenges++;
    return { a: 1, b: 1, token: "challenge" };
  },
}));
vi.mock("@/lib/turnstile.server", () => ({
  turnstileConfig: () =>
    state.turnstile ? { siteKey: "site", secretKey: "secret" } : null,
  verifyTurnstile: async () => true,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string) => {
      if (name !== "register_archy_guest") throw Error("Unexpected function");
      state.registrations++;
      return { data: 0, error: null };
    },
  },
}));
vi.mock("@/lib/work-assistant.server", () => ({
  generateWork: async () => {
    state.generated++;
    return { body: "draft", model: "gpt-test" };
  },
}));

import { workCompletion } from "@/lib/work-assistant.functions";
import {
  getAssistantChallenge,
  registerAssistantVisitor,
} from "@/lib/assistant-chat.functions";
import { WORK_AI_GLOBAL_BUCKET } from "@/lib/ai-budget.shared";

beforeEach(() => {
  Object.assign(state, {
    site: "same-origin",
    feature: true,
    pass: {
      kind: "access",
      email: "visitor@example.com",
      name: "Visitor",
      visitorId: "11111111-1111-4111-8111-111111111111",
    },
    limited: new Set<string>(),
    buckets: [],
    generated: 0,
    challenges: 0,
    registrations: 0,
    turnstile: false,
  });
});

const work = (access = "valid-pass") =>
  workCompletion({
    data: {
      feature: "ask",
      lang: "en",
      context: "question",
      content: "records",
      access,
    },
  });

describe("visitor work completions", () => {
  it("runs with a signed guest pass and spends the site-wide daily budget", async () => {
    await expect(work()).resolves.toEqual({ body: "draft", model: "gpt-test" });
    expect(state.generated).toBe(1);
    expect(state.buckets).toEqual([WORK_AI_GLOBAL_BUCKET]);
  });

  it.each([
    ["no pass", ""],
    ["an unverifiable pass", "forged-pass"],
  ])("refuses %s before any quota or OpenAI call", async (_label, access) => {
    await expect(work(access)).rejects.toThrow();
    expect(state.generated).toBe(0);
    expect(state.buckets).toEqual([]);
  });

  it("refuses a pass without a server-minted visitor id", async () => {
    state.pass = { kind: "access", email: "a@b.co", name: "A" };
    await expect(work()).rejects.toThrow();
    expect(state.generated).toBe(0);
  });

  it("refuses cross-site requests", async () => {
    state.site = "cross-site";
    await expect(work()).rejects.toThrow();
    expect(state.generated).toBe(0);
    expect(state.buckets).toEqual([]);
  });

  it("is off when the assistant feature is switched off", async () => {
    state.feature = false;
    await expect(work()).rejects.toThrow();
    expect(state.generated).toBe(0);
    expect(state.buckets).toEqual([]);
  });

  it("stops at the site-wide daily budget", async () => {
    state.limited.add(WORK_AI_GLOBAL_BUCKET);
    await expect(work()).rejects.toThrow();
    expect(state.generated).toBe(0);
  });

  it("still keeps the newsletter issue draft admin-only", async () => {
    await expect(
      workCompletion({
        data: {
          feature: "issue",
          lang: "en",
          context: "",
          content: "x",
          access: "valid-pass",
        },
      }),
    ).rejects.toThrow();
    expect(state.generated).toBe(0);
  });
});

const register = () =>
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
  });

describe("registration gate per-IP limits", () => {
  it("challenge issuance is capped per IP", async () => {
    await expect(getAssistantChallenge()).resolves.toMatchObject({
      mode: "math",
    });
    expect(state.buckets).toContain("assistant-challenge:ip");
    state.limited.add("assistant-challenge:ip");
    await expect(getAssistantChallenge()).rejects.toThrow();
    expect(state.challenges).toBe(1);
  });

  it("registration is capped per IP even when the browser cookie is fresh", async () => {
    expect((await register()).ok).toBe(true);
    expect(state.buckets).toContain("assistant-register:ip");
    state.limited.add("assistant-register:ip");
    expect(await register()).toMatchObject({ ok: false });
    expect(state.registrations).toBe(1);
  });

  it("the per-IP cap also applies with Turnstile configured", async () => {
    state.turnstile = true;
    state.limited.add("assistant-register:ip");
    expect(await register()).toMatchObject({ ok: false });
    expect(state.registrations).toBe(0);
  });

  it("a disabled assistant spends no per-IP quota", async () => {
    state.feature = false;
    await expect(getAssistantChallenge()).rejects.toThrow();
    expect((await register()).ok).toBe(false);
    expect(state.buckets).toEqual([]);
  });
});
