// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  admin: true,
  calls: [] as string[],
  rpc: [] as { name: string; args: unknown }[],
  conflict: false,
  rows: {} as Record<string, { data: unknown; error: unknown }>,
  telemetry: [] as {
    operation: string;
    outcome: string;
    duration_ms: number;
    created_at: string;
  }[],
  version: {
    id: "11111111-1111-4111-8111-111111111111",
    section: "archy",
    source: "site_settings",
    previous_value: {
      archy_greeting: {
        ar: "",
        en: "",
        voiceOn: false,
        rate: 1,
        pitch: 1,
        autoGuide: false,
        guideDelay: 6,
      },
    },
    new_value: {},
    actor_id: null,
    actor_label: "",
    restored_from: null,
    created_at: "2026-11-14",
  },
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
        h({
          data: validate(a?.data),
          context: { userId: "admin", claims: {}, supabase: {} },
        }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@/lib/admin-guard.server", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("Forbidden");
  },
}));
vi.mock("@/lib/retention-preview.server", () => ({
  signRetentionPreview: async () => ({ body: "fixture", signature: "fixture" }),
  verifyRetentionPreview: async () => true,
}));
vi.mock("@/lib/settings-restore.server", () => ({
  validateRestore: async (_section: string, v: unknown) => v,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.calls.push(table);
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        gte: () => b,
        limit: async () => ({
          data: table === "application_telemetry" ? state.telemetry : [],
          error: null,
        }),
        single: async () => ({
          data: table === "settings_versions" ? state.version : {},
          error: null,
        }),
        maybeSingle: async () =>
          state.rows[table] ?? { data: null, error: null },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
      };
      return b;
    },
    rpc: async (name: string, args: unknown) => {
      state.rpc.push({ name, args });
      return {
        data: name === "retention_candidates" ? [] : 1,
        error: state.conflict ? { message: "conflict" } : null,
      };
    },
  },
}));
import {
  getApplicationHealth,
  listSettingsVersions,
  previewSettingsRestore,
  restoreSettingsVersion,
  getRetentionPolicies,
  previewRetention,
  cleanupRetention,
  saveRetentionPolicy,
} from "@/lib/operations.functions";
beforeEach(() => {
  state.admin = true;
  state.calls = [];
  state.rpc = [];
  state.conflict = false;
  state.rows = {};
  state.telemetry = [];
});
it("shows only real latest assistant outcomes after current provider configuration", async () => {
  state.rows["ai_assistant_settings"] = {
    data: {
      base_url: "https://api.groq.com/openai/v1",
      model: "fixture-model",
      api_key: "fixture",
      updated_at: "2026-11-14T09:00:00Z",
    },
    error: null,
  };
  state.telemetry = [
    {
      operation: "assistant",
      outcome: "success",
      duration_ms: 1234,
      created_at: "2026-11-14T09:01:00Z",
    },
  ];
  expect((await getApplicationHealth()).providerObservation).toEqual({
    outcome: "success",
    durationMs: 1234,
    measuredAt: "2026-11-14T09:01:00Z",
  });
  expect((await getApplicationHealth()).providerHost).toBe("api.groq.com");
  state.telemetry[0] = {
    operation: "assistant",
    outcome: "failure",
    duration_ms: 100,
    created_at: "2026-11-14T08:59:00Z",
  };
  expect((await getApplicationHealth()).providerObservation).toBeNull();
});
it("reports locally configured semantic search separately from observed replies", async () => {
  vi.stubEnv("EA_LOCAL_SEMANTIC", "file:///local/semantic.mjs");
  vi.stubEnv("GROQ_API_KEY", "");
  try {
    expect(await getApplicationHealth()).toMatchObject({
      provider: "local",
      providerHost: null,
      providerObservation: null,
      model: "paraphrase-multilingual-MiniLM-L12-v2",
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
it("absent authoritative settings report unknown assistant and notifications, not enabled", async () => {
  const health = await getApplicationHealth();
  expect(health.assistant).toBeNull();
  expect(health.notifications).toBeNull();
  expect(health.provider).toBe("needsSetup");
  expect(health.mail).toBe("needsSetup");
});
it.each([null, [], "invalid", 42])(
  "malformed authoritative feature flags %j remain unknown",
  async (flags) => {
    state.rows["site_settings"] = {
      data: { feature_flags: flags },
      error: null,
    };
    expect((await getApplicationHealth()).assistant).toBeNull();
  },
);
it("valid missing feature keys retain authoritative defaults, while explicit false disables", async () => {
  state.rows["site_settings"] = { data: { feature_flags: {} }, error: null };
  expect((await getApplicationHealth()).assistant).toBe(true);
  state.rows["site_settings"] = {
    data: { feature_flags: { assistant: false } },
    error: null,
  };
  expect((await getApplicationHealth()).assistant).toBe(false);
});
it("lookup errors and malformed provider/mail rows never claim configuration readiness", async () => {
  for (const table of [
    "site_settings",
    "ai_assistant_settings",
    "contact_settings",
  ])
    state.rows[table] = { data: null, error: { message: "unavailable" } };
  const failed = await getApplicationHealth();
  expect(failed.assistant).toBeNull();
  expect(failed.provider).toBe("unknown");
  expect(failed.mail).toBe("unknown");
  state.rows["ai_assistant_settings"] = {
    data: { base_url: null, model: null },
    error: null,
  };
  state.rows["contact_settings"] = {
    data: { notify_enabled: "yes" },
    error: null,
  };
  const malformed = await getApplicationHealth();
  expect(malformed.provider).toBe("unknown");
  expect(malformed.mail).toBe("unknown");
  expect(malformed.notifications).toBeNull();
});
it("trusted saved provider is only configured while unsafe destinations stay blocked and mail delivery unknown", async () => {
  state.rows["ai_assistant_settings"] = {
    data: {
      base_url: "https://api.openai.com/v1",
      model: "fixture-model",
      api_key: "enc:v1:fixture",
    },
    error: null,
  };
  state.rows["contact_settings"] = {
    data: {
      recipient_email: "owner@fixture.invalid",
      notify_enabled: false,
      auto_reply_enabled: false,
    },
    error: null,
  };
  const configured = await getApplicationHealth();
  expect(configured.provider).toBe("configured");
  expect(configured.notifications).toBe(false);
  expect(configured.mail).toBe("needsSetup");
  expect(configured.deliveryVerified).toBeNull();
  state.rows["ai_assistant_settings"] = {
    data: {
      base_url: "https://untrusted.example/v1",
      model: "fixture-model",
      api_key: "enc:v1:fixture",
    },
    error: null,
  };
  expect((await getApplicationHealth()).provider).toBe("blocked");
});
it("all operational endpoints deny non-admin access before privileged reads", async () => {
  state.admin = false;
  for (const run of [
    () => getApplicationHealth(),
    () => listSettingsVersions(),
    () => getRetentionPolicies(),
    () => previewRetention({ data: { type: "chats" } }),
    () => previewSettingsRestore({ data: { id: state.version.id } }),
    () =>
      restoreSettingsVersion({
        data: { id: state.version.id, expected: {}, confirm: true },
      }),
    () =>
      cleanupRetention({
        data: {
          type: "chats",
          ids: ["id"],
          revision: 1,
          confirm: "DELETE",
          proof: { body: "fixture", signature: "fixture" },
        },
      }),
    () =>
      saveRetentionPolicy({
        data: { type: "chats", days: 90, manualEnabled: false, revision: 0 },
      }),
  ])
    await expect(run()).rejects.toThrow("Forbidden");
  expect(state.calls).toEqual([]);
  expect(state.rpc).toEqual([]);
});
it("cleanup requires literal explicit confirmation and bounded batch", async () => {
  await expect(
    cleanupRetention({
      data: {
        type: "chats",
        ids: ["id"],
        revision: 1,
        confirm: "NO" as "DELETE",
        proof: { body: "fixture", signature: "fixture" },
      },
    }),
  ).rejects.toThrow();
  await expect(
    cleanupRetention({
      data: {
        type: "chats",
        ids: Array(101).fill("id"),
        revision: 1,
        confirm: "DELETE",
        proof: { body: "fixture", signature: "fixture" },
      },
    }),
  ).rejects.toThrow();
  expect(state.rpc).toEqual([]);
});
it("forwards only explicit candidate IDs with expected policy revision to race-safe RPC", async () => {
  expect(
    await cleanupRetention({
      data: {
        type: "chats",
        ids: ["candidate"],
        revision: 7,
        confirm: "DELETE",
        proof: { body: "fixture", signature: "fixture" },
      },
    }),
  ).toEqual({ removed: 1 });
  expect(state.rpc).toEqual([
    {
      name: "cleanup_retention_batch",
      args: {
        _type: "chats",
        _ids: ["candidate"],
        _expected_revision: 7,
        _actor: "admin",
      },
    },
  ]);
});
it("restore passes sanitized historical value and exact expected section to atomic compare-and-swap", async () => {
  await restoreSettingsVersion({
    data: {
      id: state.version.id,
      expected: { archy_greeting: { ar: "current" } },
      confirm: true,
    },
  });
  expect(state.rpc[0]).toEqual({
    name: "restore_settings_version",
    args: {
      _version: state.version.id,
      _expected: { archy_greeting: { ar: "current" } },
      _value: state.version.previous_value,
      _actor: "admin",
    },
  });
});
it("restore conflicts are surfaced and never silently overwrite", async () => {
  state.conflict = true;
  await expect(
    restoreSettingsVersion({
      data: { id: state.version.id, expected: {}, confirm: true },
    }),
  ).rejects.toThrow("settingsConflict");
});
it("retention preview never deletes or exposes customer names/email", async () => {
  const r = await previewRetention({ data: { type: "chats" } });
  expect(r.enabled).toBe(false);
  expect(r.days).toBe(90);
  expect(r.candidates).toEqual([]);
  expect(state.rpc.every((r) => r.name === "retention_candidates")).toBe(true);
});
