type Operation = "assistant" | "recommendation" | "request";
/** No arbitrary text fields: never records prompts, provider errors, keys or visitor identity. */
export async function recordTelemetry(
  operation: Operation,
  outcome: "success" | "failure",
  start: number,
  code: "none" | "provider" | "storage" | "receipt" | "internal" = "none",
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("application_telemetry").insert({
      operation,
      outcome,
      duration_ms: Math.min(300000, Math.max(0, Math.round(performance.now() - start))),
      code,
    });
    // Assistant/recommendation answers feed both AI alerts, whatever the outcome.
    if (operation !== "request") await noteAiFailures();
    // Sanitized diagnostics only; use the same policy cutoff as manual preview.
    const policy = await supabaseAdmin
      .from("retention_policies")
      .select("days")
      .eq("data_type", "telemetry")
      .maybeSingle();
    if (policy.error) return;
    const old = await supabaseAdmin
      .from("application_telemetry")
      .select("id")
      .lt("created_at", new Date(Date.now() - (policy.data?.days ?? 30) * 86400000).toISOString())
      .order("created_at")
      .limit(100);
    if (old.data?.length)
      await supabaseAdmin
        .from("application_telemetry")
        .delete()
        .in(
          "id",
          old.data.map((r) => r.id),
        );
  } catch {
    /* Observability must not invalidate a stored receipt or an answer. */
  }
}

export async function measured<T>(operation: Operation, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await run();
    await recordTelemetry(operation, "success", start);
    return result;
  } catch (error) {
    await recordTelemetry(operation, "failure", start, "provider");
    throw error;
  }
}

/**
 * Logs "ai.failure_alert" (provider failures) and "ai.chat_degraded" (last hour's answer
 * quality or reply speed dropping) in the admin activity log, each at most once an hour.
 */
export async function noteAiFailures(now = Date.now()): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { AI_OPERATIONS, aiFailureAlert, aiChatHealth } = await import("./operations.shared");
    const { data, error } = await supabaseAdmin
      .from("application_telemetry")
      .select("operation,outcome,created_at,duration_ms")
      .in("operation", [...AI_OPERATIONS])
      .gte("created_at", new Date(now - 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return;
    const rows = data ?? [];
    const { checkLimits, SYSTEM_ACTOR_ID } = await import("./rate-limit.server");
    const alert = aiFailureAlert(rows, now);
    if (alert) {
      const first = await checkLimits([
        { bucket: "alert:ai-failure", subject: "hour", limit: 1, windowSeconds: 3600 },
      ]);
      if (first === "ok")
        await supabaseAdmin.from("admin_activity").insert({
          actor_id: SYSTEM_ACTOR_ID,
          actor_email: "system",
          action: "ai.failure_alert",
          target: `${alert.reason} streak=${alert.streak} hour=${alert.hourFailures}/${alert.hourSamples}`,
        });
    }
    const chat = aiChatHealth(rows, now);
    if (!chat.alert) return;
    const first = await checkLimits([
      { bucket: "alert:ai-chat", subject: "hour", limit: 1, windowSeconds: 3600 },
    ]);
    if (first !== "ok") return;
    await supabaseAdmin.from("admin_activity").insert({
      actor_id: SYSTEM_ACTOR_ID,
      actor_email: "system",
      action: "ai.chat_degraded",
      target: `${chat.alert.reason} success=${chat.hourSuccess}/${chat.hourSamples} median=${chat.medianMs ?? "n/a"}ms`,
    });
  } catch {
    /* monitoring only */
  }
}
