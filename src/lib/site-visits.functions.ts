import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PRODUCT_VIEW_PREFIX,
  isVisitorKey,
  riyadhDay,
  summarizeContacts,
  type Funnel,
  type VisitStats,
} from "./site-visits.shared";

/** Counts one anonymous browser per Riyadh day. Stores only a random browser id, never IP or identity. */
export const recordVisit = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const key = row["key"];
    if (!isVisitorKey(key)) throw new Error("bad key");
    return { key: key.toLowerCase(), product: row["kind"] === "product" };
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { consumeLimits, clientIp } = await import("./rate-limit.server");
      const allowed = await consumeLimits([
        { bucket: "visit", subject: clientIp(getRequest()), limit: 30, windowSeconds: 3600 },
      ]);
      if (!allowed) return { ok: false };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("site_visits")
        .upsert(
          {
            visitor_key: data.product ? PRODUCT_VIEW_PREFIX + data.key : data.key,
            day: riyadhDay(),
          },
          { onConflict: "visitor_key,day", ignoreDuplicates: true },
        );
      return { ok: !error };
    } catch {
      return { ok: false };
    }
  });

/** Admin-only counts for today: visitors, returning visitors, and who chatted or sent a request. */
export const getVisitStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VisitStats> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const day = riyadhDay();
    const start = new Date(`${day}T00:00:00+03:00`).toISOString();
    const keys: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin
        .from("site_visits")
        .select("visitor_key")
        .eq("day", day)
        .not("visitor_key", "like", `${PRODUCT_VIEW_PREFIX}%`)
        .order("visitor_key")
        .range(offset, offset + 999);
      if (error) throw new Error("visits load failed");
      keys.push(...(data ?? []).map((r) => r.visitor_key));
      if ((data?.length ?? 0) < 1000) break;
    }
    let returning = 0;
    for (let i = 0; i < keys.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from("site_visits")
        .select("visitor_key")
        .in("visitor_key", keys.slice(i, i + 200))
        .lt("day", day);
      if (error) throw new Error("visits load failed");
      returning += new Set((data ?? []).map((r) => r.visitor_key)).size;
    }
    const [chats, requests] = await Promise.all([
      context.supabase
        .from("live_chats")
        .select("visitor_email, visitor_name")
        .gte("created_at", start)
        .limit(1000),
      supabaseAdmin
        .from("suggestion_requests")
        .select("email, name")
        .gte("created_at", start)
        .limit(1000),
    ]);
    if (chats.error || requests.error) throw new Error("contacts load failed");
    return {
      day,
      today: keys.length,
      returning,
      ...summarizeContacts(chats.data ?? [], requests.data ?? []),
    };
  });

/** Distinct keys in site_visits since a day, either site visitors or product-page viewers. */
async function distinctKeys(since: string, product: boolean): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const seen = new Set<string>();
  for (let offset = 0; offset < 50_000; offset += 1000) {
    let query = supabaseAdmin.from("site_visits").select("visitor_key").gte("day", since);
    query = product
      ? query.like("visitor_key", `${PRODUCT_VIEW_PREFIX}%`)
      : query.not("visitor_key", "like", `${PRODUCT_VIEW_PREFIX}%`);
    const { data, error } = await query
      .order("visitor_key")
      .order("day")
      .range(offset, offset + 999);
    if (error) throw new Error("visits load failed");
    for (const row of data ?? []) seen.add(row.visitor_key);
    if ((data?.length ?? 0) < 1000) break;
  }
  return seen.size;
}

/**
 * Admin-only customer journey for the last 7 or 30 Riyadh days: unique visitors, unique
 * browsers that opened a product page, chats with the team, and requests received.
 */
export const getFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => {
    const days = value && typeof value === "object" ? (value as Record<string, unknown>)["days"] : 30;
    return { days: days === 7 ? 7 : 30 };
  })
  .handler(async ({ data, context }): Promise<Funnel> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = riyadhDay(new Date(Date.now() - (data.days - 1) * 86_400_000));
    const start = new Date(`${since}T00:00:00+03:00`).toISOString();
    const [visitors, productViewers, chats, requests, waitlist] = await Promise.all([
      distinctKeys(since, false),
      distinctKeys(since, true),
      supabaseAdmin.from("live_chats").select("id", { count: "exact", head: true }).gte("created_at", start),
      supabaseAdmin
        .from("suggestion_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start),
      supabaseAdmin
        .from("suggestion_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .eq("details->>source", "waitlist"),
    ]);
    if (chats.error || requests.error) throw new Error("funnel load failed");
    return {
      days: data.days,
      since,
      stages: [
        { stage: "visitors", count: visitors },
        { stage: "productViewers", count: productViewers },
        { stage: "chats", count: chats.count ?? 0 },
        { stage: "requests", count: requests.count ?? 0 },
      ],
      waitlistRequests: waitlist.error ? 0 : (waitlist.count ?? 0),
    };
  });
