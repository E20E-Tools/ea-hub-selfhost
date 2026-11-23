import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isVisitorKey, riyadhDay, summarizeContacts, type VisitStats } from "./site-visits.shared";

/** Counts one anonymous browser per Riyadh day. Stores only a random browser id, never IP or identity. */
export const recordVisit = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const key = value && typeof value === "object" ? (value as Record<string, unknown>)["key"] : "";
    if (!isVisitorKey(key)) throw new Error("bad key");
    return { key: key.toLowerCase() };
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
          { visitor_key: data.key, day: riyadhDay() },
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
