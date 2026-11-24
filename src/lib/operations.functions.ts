import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { authoritativeFeatureState } from "./site-features";
import {
  aiChatHealth,
  aiFailureAlert,
  budgetAlerts,
  retentionPolicySchema,
  retentionTypeSchema,
  summarizeTelemetry,
} from "./operations.shared";

async function admin(context: import("./admin-guard.server").GuardContext) {
  await (await import("./admin-guard.server")).requireAdmin(context);
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const getApplicationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const budget = await import("./ai-budget.shared");
    const { hashSubject } = await import("./rate-limit.server");
    const allSubject = await hashSubject("all");
    const daySince = new Date(Date.now() - 86_400_000).toISOString();
    const usageCount = (bucket: string) =>
      db
        .from("rate_limit_events")
        .select("id", { count: "exact", head: true })
        .eq("bucket", bucket)
        .eq("subject", allSubject)
        .gte("created_at", daySince);
    const [ai, mail, flags, telemetry, requestUsage, chatUsage] = await Promise.all([
      db
        .from("ai_assistant_settings")
        .select("base_url,model,api_key,updated_at,chat_engine")
        .eq("id", true)
        .maybeSingle(),
      db
        .from("contact_settings")
        .select("notify_enabled,auto_reply_enabled,recipient_email")
        .eq("id", true)
        .maybeSingle(),
      db.from("site_settings").select("feature_flags").eq("id", true).maybeSingle(),
      db
        .from("application_telemetry")
        .select("operation,outcome,duration_ms,created_at")
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500),
      usageCount(budget.REQUEST_GLOBAL_BUCKET),
      usageCount(budget.CHAT_GLOBAL_BUCKET),
    ]);
    const { aiBaseUrlProblem, isOfficialGroq } = await import("./ai-settings.shared");
    const base = ai.data?.base_url;
    const endpoint = base ?? "https://api.groq.com/openai/v1";
    const validEndpoint = typeof endpoint === "string" && !aiBaseUrlProblem(endpoint);
    const hasCloudKey = Boolean(
      ai.data?.api_key ||
      (validEndpoint && isOfficialGroq(endpoint) && process.env["GROQ_API_KEY"]),
    );
    const localSemantic =
      !ai.error &&
      (ai.data?.chat_engine === "local" || (!ai.data?.chat_engine && validEndpoint && !hasCloudKey)) &&
      Boolean(process.env["EA_LOCAL_SEMANTIC"]?.startsWith("file:"));
    const configuredAt = ai.data?.updated_at;
    const latestAssistant =
      telemetry.error || ai.error || (!ai.data && !localSemantic && !hasCloudKey)
        ? undefined
        : telemetry.data?.find(
            (row) =>
              row.operation === "assistant" && (!configuredAt || row.created_at >= configuredAt),
          );
    return {
      checkedAt: new Date().toISOString(),
      assistant:
        flags.error || !flags.data
          ? null
          : authoritativeFeatureState(flags.data.feature_flags, "assistant"),
      provider: ai.error
        ? "unknown"
        : localSemantic
          ? "local"
          : !ai.data
            ? hasCloudKey
              ? "configured"
              : "needsSetup"
            : typeof base !== "string" || typeof ai.data.model !== "string" || !ai.data.model.trim()
              ? "unknown"
              : aiBaseUrlProblem(base)
                ? "blocked"
                : hasCloudKey
                  ? "configured"
                  : "needsSetup",
      model: ai.error
        ? null
        : localSemantic
          ? "paraphrase-multilingual-MiniLM-L12-v2"
          : (ai.data?.model ?? (hasCloudKey ? "openai/gpt-oss-120b" : null)),
      providerHost:
        !ai.error && !localSemantic && validEndpoint && (ai.data || hasCloudKey)
          ? new URL(endpoint).hostname
          : null,
      providerObservation: latestAssistant
        ? {
            outcome: latestAssistant.outcome,
            measuredAt: latestAssistant.created_at,
            durationMs: latestAssistant.duration_ms,
          }
        : null,
      mail: mail.error
        ? "unknown"
        : !mail.data
          ? "needsSetup"
          : typeof mail.data.notify_enabled !== "boolean" ||
              typeof mail.data.auto_reply_enabled !== "boolean"
            ? "unknown"
            : (await import("./contact-notify.server")).EMAIL_SENDING_ACTIVE &&
                z.string().email().safeParse(mail.data.recipient_email).success
              ? "configured"
              : "needsSetup",
      notifications:
        mail.error || typeof mail.data?.notify_enabled !== "boolean"
          ? null
          : mail.data.notify_enabled,
      deliveryVerified: null,
      measurements: telemetry.error ? null : summarizeTelemetry(telemetry.data ?? []),
      // null = unknown (telemetry unreadable), never "no problem".
      aiAlert: telemetry.error ? null : aiFailureAlert(telemetry.data ?? []),
      // Last hour of conversation answers: successes, reply times and a degradation alert.
      chatHealth: telemetry.error ? null : aiChatHealth(telemetry.data ?? []),
      budgetAlerts:
        requestUsage.error || chatUsage.error
          ? null
          : budgetAlerts(
              [
                {
                  kind: "request",
                  used: requestUsage.count ?? 0,
                  limit: budget.REQUEST_GLOBAL_DAY_LIMIT,
                },
                {
                  kind: "chat",
                  used: chatUsage.count ?? 0,
                  limit: budget.CHAT_GLOBAL_DAY_LIMIT,
                },
              ],
              budget.budgetAlertThreshold,
            ),
      sampleLimit: 500,
      sinceHours: 24,
    };
  });

export const listSettingsVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const result = await db
      .from("settings_versions")
      .select(
        "id,section,source,actor_id,actor_label,previous_value,new_value,restored_from,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw new Error("historyLoadFailed");
    return result.data ?? [];
  });

export const previewSettingsRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const h = await db.from("settings_versions").select("*").eq("id", data.id).single();
    if (h.error || !h.data) throw new Error("historyLoadFailed");
    const version = h.data;
    const source = version.source;
    if (
      source !== "site_settings" &&
      source !== "ai_assistant_settings" &&
      source !== "contact_settings"
    )
      throw new Error("Invalid source");
    const result = await db.from(source).select("*").eq("id", true).single();
    if (result.error) throw new Error("historyLoadFailed");
    const sectionValue = await db.rpc("settings_section_value", {
      source_name: source,
      section_name: version.section,
      row_value: result.data as never,
    });
    if (sectionValue.error) throw new Error("historyLoadFailed");
    await (
      await import("./settings-restore.server")
    ).validateRestore(version.section, version.previous_value);
    return {
      id: version.id,
      section: version.section,
      current: sectionValue.data,
      restore: version.previous_value,
    };
  });

export const restoreSettingsVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        expected: z.record(z.string(), z.unknown()),
        confirm: z.literal(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const h = await db.from("settings_versions").select("*").eq("id", data.id).single();
    if (h.error || !h.data) throw new Error("historyLoadFailed");
    const value = await (
      await import("./settings-restore.server")
    ).validateRestore(h.data.section, h.data.previous_value);
    if (h.data.section === "ai") {
      const ai = await db
        .from("ai_assistant_settings")
        .select("base_url,api_key")
        .eq("id", true)
        .single();
      const { aiOrigin, isOfficialGroq } = await import("./ai-settings.shared");
      if (
        ai.error ||
        (ai.data.api_key && aiOrigin(ai.data.base_url) !== aiOrigin(String(value["base_url"]))) ||
        (!ai.data.api_key && !isOfficialGroq(String(value["base_url"])))
      )
        throw new Error("errAiKeyOrigin");
    }
    const result = await db.rpc("restore_settings_version", {
      _version: data.id,
      _expected: data.expected as never,
      _value: value as never,
      _actor: context.userId,
    });
    if (result.error) throw new Error("settingsConflict");
    (await import("./catalog-cache.server")).invalidateCatalogCache();
    return { ok: true };
  });

export const getRetentionPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const r = await db.from("retention_policies").select("*");
    if (r.error) throw new Error("retentionLoadFailed");
    return (["chats", "visits", "telemetry"] as const).map((type) => {
      const p = r.data?.find((x) => x.data_type === type);
      return {
        type,
        days: p?.days ?? (type === "telemetry" ? 30 : 90),
        manualEnabled: p?.manual_enabled ?? false,
        revision: p?.revision ?? 0,
      };
    });
  });
export const saveRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => retentionPolicySchema.parse(v))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const row = {
      data_type: data.type,
      days: data.days,
      manual_enabled: data.manualEnabled,
      revision: data.revision + 1,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const r =
      data.revision === 0
        ? await db.from("retention_policies").insert(row)
        : await db
            .from("retention_policies")
            .update(row)
            .eq("data_type", data.type)
            .eq("revision", data.revision)
            .select("data_type")
            .single();
    if (r.error) throw new Error("retentionConflict");
    await (
      await import("./admin.functions")
    ).logActivity(
      context,
      "retention.policy",
      `${data.type} days=${data.days} enabled=${data.manualEnabled}`,
    );
    return { ok: true };
  });
export const previewRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ type: retentionTypeSchema }).parse(v))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const p = await db
      .from("retention_policies")
      .select("*")
      .eq("data_type", data.type)
      .maybeSingle();
    if (p.error) throw new Error("retentionLoadFailed");
    const days = p.data?.days ?? (data.type === "telemetry" ? 30 : 90);
    const r = await db.rpc("retention_candidates", {
      _type: data.type,
      _days: days,
      _limit: 101,
    });
    if (r.error) throw new Error("retentionLoadFailed");
    const table =
      data.type === "chats"
        ? "live_chats"
        : data.type === "visits"
          ? "site_visits"
          : "application_telemetry";
    const count = await db.from(table).select("*", { count: "exact", head: true });
    if (count.error) throw new Error("retentionLoadFailed");
    const candidates = (r.data ?? []).slice(0, 100);
    const proof = await (
      await import("./retention-preview.server")
    ).signRetentionPreview(
      context.userId,
      data.type,
      p.data?.revision ?? 0,
      candidates.map((c) => c.candidate_id),
    );
    return {
      type: data.type,
      days,
      revision: p.data?.revision ?? 0,
      enabled: p.data?.manual_enabled ?? false,
      total: count.count,
      candidates,
      proof,
      hasMore: (r.data?.length ?? 0) > 100,
    };
  });
export const cleanupRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        type: retentionTypeSchema,
        ids: z.array(z.string().max(200)).min(1).max(100),
        revision: z.number().int().min(1),
        confirm: z.literal("DELETE"),
        proof: z.object({
          body: z.string().max(25000),
          signature: z.string().max(200),
        }),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    if (
      !(await (
        await import("./retention-preview.server")
      ).verifyRetentionPreview(data.proof, context.userId, data.type, data.revision, data.ids))
    )
      throw new Error("retentionConflict");
    const r = await db.rpc("cleanup_retention_batch", {
      _type: data.type,
      _ids: data.ids,
      _expected_revision: data.revision,
      _actor: context.userId,
    });
    if (r.error) throw new Error("retentionConflict");
    return { removed: r.data };
  });
