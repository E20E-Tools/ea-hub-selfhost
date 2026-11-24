export type LimitRule = {
  bucket: string;
  limit: number;
  windowSeconds: number;
  subject: string;
};

export async function hashSubject(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function clientIp(request: Request): string {
  // Cloudflare sets this at the trusted edge; never trust X-Forwarded-For.
  if (process.env["VERCEL"] === "1")
    return (
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown-client"
    );
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
}

export type LimitOutcome = "ok" | "limited" | "error";

/** Like consumeLimits, but tells genuine exhaustion apart from a store failure. */
export async function checkLimits(rules: LimitRule[]): Promise<LimitOutcome> {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    for (const rule of rules) {
      const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
        _bucket: rule.bucket,
        _subject: await hashSubject(rule.subject),
        _limit: rule.limit,
        _window_seconds: rule.windowSeconds,
      });
      if (error) {
        console.error("rate limit store error", error.code);
        return "error";
      }
      // Only an explicit false means the quota is exhausted; anything else unexpected is a
      // protocol failure and must never be treated as abuse.
      if (data === false) return "limited";
      if (data !== true) {
        console.error("rate limit store returned unexpected data");
        return "error";
      }
    }
    return "ok";
  } catch {
    return "error";
  }
}

/** Durable, shared across server instances. Fails closed if the store is unreachable. */
export async function consumeLimits(rules: LimitRule[]): Promise<boolean> {
  return (await checkLimits(rules)) === "ok";
}

/** Zero UUID used for automated entries in the admin activity log. */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Logs one admin-activity entry per UTC day when a site-wide daily budget reaches 80%.
 * Best effort: monitoring never blocks or fails the visitor's request.
 */
export async function noteBudgetUsage(
  bucket: string,
  limit: number,
  action: string,
  now = new Date(),
): Promise<void> {
  try {
    const { budgetAlertThreshold } = await import("./ai-budget.shared");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("subject", await hashSubject("all"))
      .gte("created_at", new Date(now.getTime() - 86_400_000).toISOString());
    if (error || count === null || count < budgetAlertThreshold(limit)) return;
    const day = now.toISOString().slice(0, 10);
    const first = await checkLimits([
      {
        bucket: `alert:${bucket}`,
        subject: day,
        limit: 1,
        windowSeconds: 86_400,
      },
    ]);
    if (first !== "ok") return;
    await supabaseAdmin.from("admin_activity").insert({
      actor_id: SYSTEM_ACTOR_ID,
      actor_email: "system",
      action,
      target: `${count}/${limit}`,
    });
  } catch {
    /* monitoring only */
  }
}
