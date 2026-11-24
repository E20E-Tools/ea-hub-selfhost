import { z } from "zod";

export const retentionTypeSchema = z.enum(["chats", "visits", "telemetry"]);
export type RetentionType = z.infer<typeof retentionTypeSchema>;
export const retentionPolicySchema = z
  .object({
    type: retentionTypeSchema,
    days: z.number().int().min(30).max(730),
    manualEnabled: z.boolean(),
    revision: z.number().int().min(0),
  })
  .refine(
    (v) => v.type !== "chats" || v.days === 90,
    "Chats retain the existing 90-day policy",
  );

export function summarizeTelemetry(
  rows: { operation: string; outcome: string; duration_ms: number }[],
) {
  return ["assistant", "recommendation", "request"].map((operation) => {
    const samples = rows.filter((r) => r.operation === operation);
    return {
      operation,
      samples: samples.length,
      success: samples.filter((r) => r.outcome === "success").length,
      failure: samples.filter((r) => r.outcome === "failure").length,
      meanMs: samples.length
        ? Math.round(
            samples.reduce((sum, r) => sum + r.duration_ms, 0) / samples.length,
          )
        : null,
    };
  });
}

/** Mirror of database eligibility for regression fixtures, not a client authorization decision. */
export function chatCleanupEligible(
  chat: { status: string; lastMessageAt: string; openSupport: boolean },
  now: number,
  days = 90,
) {
  return (
    !["waiting", "active"].includes(chat.status) &&
    !chat.openSupport &&
    Date.parse(chat.lastMessageAt) < now - days * 86400000
  );
}

export function sanitizeSettingsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSettingsValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(key|secret|token|password|authorization|cookie)/i.test(key),
        )
        .map(([key, v]) => [key, sanitizeSettingsValue(v)]),
    );
  if (typeof value === "string")
    return value
      .replace(/(https:\/\/[^\s?]+)\?[^\s]+/g, "$1")
      .replace(
        /(?:sk-[\w-]{12,}|gsk_[\w-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g,
        "[redacted]",
      );
  return value;
}

/** AI operations watched for provider failures (request saving is not an AI call). */
export const AI_OPERATIONS = ["assistant", "recommendation"] as const;
export const AI_FAILURE_STREAK = 3;
export const AI_FAILURE_RATE = 0.3;
/** Fewer answers than this in the last hour are covered by the streak rule only. */
export const AI_FAILURE_MIN_SAMPLES = 5;

export type AiFailureAlert = {
  /** Failures in a row, counted from the most recent AI answer. */
  streak: number;
  hourFailures: number;
  hourSamples: number;
  reason: "streak" | "rate";
} | null;

/**
 * Alert when the latest 3 AI answers all failed, or more than 30% of the last hour's
 * answers failed (with at least 5 answers in that hour).
 */
export function aiFailureAlert(
  rows: readonly { operation: string; outcome: string; created_at: string }[],
  now = Date.now(),
): AiFailureAlert {
  const ai = rows
    .filter((r) => (AI_OPERATIONS as readonly string[]).includes(r.operation))
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  let streak = 0;
  for (const row of ai) {
    if (row.outcome !== "failure") break;
    streak += 1;
  }
  const hour = ai.filter((r) => Date.parse(r.created_at) >= now - 3_600_000);
  const hourFailures = hour.filter((r) => r.outcome === "failure").length;
  const rate =
    hour.length >= AI_FAILURE_MIN_SAMPLES &&
    hourFailures / hour.length > AI_FAILURE_RATE;
  if (streak >= AI_FAILURE_STREAK)
    return { streak, hourFailures, hourSamples: hour.length, reason: "streak" };
  if (rate)
    return { streak, hourFailures, hourSamples: hour.length, reason: "rate" };
  return null;
}

export type BudgetAlert = {
  kind: "request" | "chat";
  used: number;
  limit: number;
};

/** Daily site-wide budgets at or above the 80% alert threshold. */
export function budgetAlerts(
  usage: readonly { kind: BudgetAlert["kind"]; used: number; limit: number }[],
  threshold: (limit: number) => number,
): BudgetAlert[] {
  return usage
    .filter((u) => u.used >= threshold(u.limit))
    .map((u) => ({ ...u }));
}

/* ---------------- AI chat health ---------------- */

/** Assistant answers in the last hour below this are covered by the streak rule only. */
export const CHAT_HEALTH_MIN_SAMPLES = 5;
/** Median answer time above this is a slow-reply alert (ms). */
export const CHAT_HEALTH_SLOW_MS = 15_000;
/** Success share of the last hour's answers below this is a quality alert. */
export const CHAT_HEALTH_SUCCESS_RATE = 0.7;

export type AiChatHealthAlert = {
  reason: "slow" | "lowSuccess";
  hourSuccess: number;
  hourSamples: number;
  medianMs: number;
};

export type AiChatHealth = {
  hourSamples: number;
  hourSuccess: number;
  /** null when no answer was measured in the last hour. */
  successRate: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  alert: AiChatHealthAlert | null;
};

/** Nearest-rank percentile over an ascending list; null when empty. */
function percentile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1),
  );
  const value = sorted[index];
  return value === undefined ? null : Math.round(value);
}

/**
 * Chat answer quality for the last hour: successful answers, their median and slowest-5%
 * reply times, and an alert when either the success share or the median reply time drops.
 * Only assistant (conversation) answers count; recommendations and requests are separate.
 */
export function aiChatHealth(
  rows: readonly {
    operation: string;
    outcome: string;
    duration_ms: number;
    created_at: string;
  }[],
  now = Date.now(),
): AiChatHealth {
  const hour = rows.filter(
    (r) =>
      r.operation === "assistant" &&
      Date.parse(r.created_at) >= now - 3_600_000,
  );
  const hourSuccess = hour.filter((r) => r.outcome === "success").length;
  const successRate = hour.length ? hourSuccess / hour.length : null;
  const times = hour
    .filter((r) => r.outcome === "success")
    .map((r) => r.duration_ms)
    .filter((ms) => Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b);
  const medianMs = percentile(times, 0.5);
  const p95Ms = percentile(times, 0.95);
  let alert: AiChatHealthAlert | null = null;
  if (
    hour.length >= CHAT_HEALTH_MIN_SAMPLES &&
    successRate !== null &&
    successRate < CHAT_HEALTH_SUCCESS_RATE
  ) {
    alert = {
      reason: "lowSuccess",
      hourSuccess,
      hourSamples: hour.length,
      medianMs: medianMs ?? 0,
    };
  } else if (medianMs !== null && medianMs > CHAT_HEALTH_SLOW_MS) {
    alert = { reason: "slow", hourSuccess, hourSamples: hour.length, medianMs };
  }
  return {
    hourSamples: hour.length,
    hourSuccess,
    successRate,
    medianMs,
    p95Ms,
    alert,
  };
}
