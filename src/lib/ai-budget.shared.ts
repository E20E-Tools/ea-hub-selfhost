/** Daily paid-AI budgets shared by the endpoints that enforce them and the admin monitor. */
export const CHAT_GLOBAL_DAY_LIMIT = 500;
export const RECOMMEND_GLOBAL_DAY_LIMIT = 500;
export const CHAT_GLOBAL_BUCKET = "chat:global-day";
export const RECOMMEND_GLOBAL_BUCKET = "ai:global-day";
/** Site-wide daily cap on saved requests (all request forms together). */
export const REQUEST_GLOBAL_DAY_LIMIT = 300;
export const REQUEST_GLOBAL_BUCKET = "request:global-day";
/** Share of a daily site-wide budget at which admins are alerted (once per day per budget). */
export const BUDGET_ALERT_RATIO = 0.8;

export function budgetAlertThreshold(limit: number): number {
  return Math.ceil(limit * BUDGET_ALERT_RATIO);
}

/**
 * Rate-limit subject for limits tied to a typed (unverified) email: combined with the client
 * IP so nobody can use up someone else's quota just by typing their address.
 */
export function ipEmailSubject(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

/** Site-wide daily cap on visitor work-assistant completions (paid OpenAI calls). */
export const WORK_AI_GLOBAL_DAY_LIMIT = 200;
export const WORK_AI_GLOBAL_BUCKET = "archy-work-ai:global-day";
