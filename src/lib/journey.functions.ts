import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  journeyEventSchema,
  monthlyRequestCount,
  privacySignalInHeaders,
  riyadhMonth,
  summarizeJourney,
  type JourneyAggregateRow,
} from "./journey.shared";

export const recordJourneyEvent = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => journeyEventSchema.parse(value))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return { ok: false };
    // Respect GPC/DNT even if a client ignores its own opt-out check.
    if (privacySignalInHeaders(request.headers)) return { ok: false };
    const { checkLimits, clientIp } = await import("./rate-limit.server");
    const outcome = await checkLimits([
      {
        bucket: "journey:ip",
        subject: clientIp(request),
        limit: 120,
        windowSeconds: 600,
      },
      {
        bucket: "journey:global-day",
        subject: "all",
        limit: 5000,
        windowSeconds: 86400,
      },
    ]);
    if (outcome !== "ok") return { ok: false };
    const { recordJourney } = await import("./journey.server");
    return {
      ok: await recordJourney(
        data.event,
        data.language,
        data.eventKey,
        data.rating ?? undefined,
      ),
    };
  });

export const getJourneyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    const since = new Date(Date.now() - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await context.supabase
      .from("journey_aggregates")
      .select("day,event,language,count,rating_sum")
      .gte("day", since)
      .order("day", { ascending: false })
      .limit(2000);
    if (error) throw new Error("journeyLoadFailed");
    const rows = (data ?? []) as JourneyAggregateRow[];
    const month = riyadhMonth(new Date());
    return {
      rows,
      since,
      days: 30,
      month,
      monthlyRequests: monthlyRequestCount(rows, month),
      ...summarizeJourney(rows),
    };
  });
