export const RECOMMEND_LIMIT_MESSAGE =
  "تم الوصول إلى الحد الأقصى للاقتراحات مؤقتًا. يرجى الانتظار بضع دقائق.";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 4;
const MAX_CLIENTS = 10_000;

/** Synchronous admission is atomic within an isolate; no client storage or timers. */
export function createRecommendationGuard() {
  const clients = new Map<string, number[]>();
  return (request: Request, now = Date.now()): string | null => {
    const site = request.headers.get("sec-fetch-site");
    if (site !== "same-origin" && site !== "none")
      return "لا يُسمح بطلب الاقتراحات من خارج الموقع.";

    // Cloudflare overwrites this header at the trusted ingress. Never trust
    // caller-controlled X-Forwarded-For. Without an ingress IP, share a quota.
    const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
    for (const [key, timestamps] of clients) {
      const active = timestamps.filter((time) => time > now - WINDOW_MS);
      if (active.length === 0) clients.delete(key);
      else clients.set(key, active);
    }
    const timestamps = clients.get(ip) ?? [];
    if (timestamps.length >= MAX_REQUESTS || (!clients.has(ip) && clients.size >= MAX_CLIENTS)) {
      return RECOMMEND_LIMIT_MESSAGE;
    }
    timestamps.push(now);
    clients.set(ip, timestamps);
    return null;
  };
}

// Isolate-local: resets on restart and does not coordinate multiple workers.
export const guardRecommendation = createRecommendationGuard();
