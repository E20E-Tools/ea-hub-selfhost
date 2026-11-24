// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createBackend } from "tinbase";
import { loadSupabaseProject, serve } from "tinbase/node";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Run the real handlers, validators and database on loopback. Only the transport
// and paid model are substituted; quota, token signing and rating ownership stay real.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const chain = {
      middleware: () => chain,
      inputValidator: (
        schema: ((v: unknown) => unknown) | { parse: (v: unknown) => unknown },
      ) => {
        validate =
          typeof schema === "function" ? schema : (v) => schema.parse(v);
        return chain;
      },
      handler:
        (fn: (args: { data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ data: validate(args?.data) }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (key: string) => jar.get(key),
  setCookie: (key: string, value: string) => jar.set(key, value),
  setResponseHeader: vi.fn(),
  getRequest: () => new Request("http://127.0.0.1/"),
}));
vi.mock("@/lib/recommend.server", () => ({
  runAssistantChat: async () => ({
    answer: { summary: "Isolated release reply", picks: [] },
    source: "test-provider",
    model: "release-fixture",
  }),
}));
it("registers a visitor, serves a reply and stores its model and the visitor rating", async () => {
  const project = await loadSupabaseProject(path.resolve("local-backend"));
  const backend = await createBackend({
    ...project,
    jwtSecret: randomUUID() + randomUUID(),
  });
  const server = await serve(backend, { port: 0, host: "127.0.0.1" });
  try {
    expect(backend.db.migrationFailure).toBeFalsy();
    vi.stubEnv("SUPABASE_URL", server.url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", backend.serviceRoleKey);
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", backend.anonKey);
    vi.stubEnv("APP_ENCRYPTION_KEY", randomUUID());
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const check = await fetch(
      server.url + "/rest/v1/site_settings?select=feature_flags",
      {
        headers: {
          apikey: backend.anonKey,
          authorization: "Bearer " + backend.anonKey,
        },
      },
    );
    expect(await check.text()).toContain("assistant");
    const {
      getAssistantChallenge,
      registerAssistantVisitor,
      sendAssistantMessage,
    } = await import("@/lib/assistant-chat.functions");
    const challenge = await getAssistantChallenge();
    if (challenge.mode !== "math") throw Error("Fixture challenge unavailable");
    const registration = await registerAssistantVisitor({
      data: {
        name: "Release test",
        email: "release@example.test",
        question: "",
        answer: String(challenge.a + challenge.b),
        token: challenge.token,
        language: "en",
      },
    });
    if (!registration.ok) throw Error(registration.message);
    const reply = await sendAssistantMessage({
      data: {
        access: registration.token,
        language: "en",
        turns: [{ role: "user", content: "Which tool assesses technology?" }],
      },
    });
    if (!reply.ok || !reply.messageId) throw Error("Missing stored reply");
    const { rateArchyReply } = await import("@/lib/archy-quality.functions");
    await rateArchyReply({
      data: {
        access: registration.token,
        id: reply.messageId,
        helpful: true,
        reason: null,
      },
    });
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    // Two different browsers use the same transport/IP. Only the first visitor should hit their quota.
    const policy = await supabaseAdmin.from("ai_assistant_settings").upsert({
      id: true,
      registration_limit: 2,
      registration_wait_minutes: 3,
    });
    expect(policy.error).toBeNull();
    async function registerAgain() {
      const c = await getAssistantChallenge();
      if (c.mode !== "math") throw Error("Expected math");
      return registerAssistantVisitor({
        data: {
          name: "Release test",
          email: "release@example.test",
          question: "",
          answer: String(c.a + c.b),
          token: c.token,
          language: "en",
        },
      });
    }
    expect((await registerAgain()).ok).toBe(true);
    const blocked = await registerAgain();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAt).toBeGreaterThan(Date.now() + 170000);
      expect(blocked.retryAt).toBeLessThanOrEqual(Date.now() + 180001);
    }
    jar.clear();
    expect((await registerAgain()).ok).toBe(true);
    const { data, error } = await supabaseAdmin
      .from("live_chat_messages")
      .select("reply_source,reply_model,helpful")
      .eq("id", reply.messageId)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      reply_source: "test-provider",
      reply_model: "release-fixture",
      helpful: true,
    });
  } finally {
    await server.close();
    await backend.close();
    vi.unstubAllEnvs();
  }
}, 60000);
