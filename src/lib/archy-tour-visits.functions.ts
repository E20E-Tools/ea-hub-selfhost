import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isVisitorKey } from "./site-visits.shared";
import { tourVisitPatch, type TourVisit } from "./archy-tour-visits.shared";

export const startTourVisit = createServerFn({ method: "POST" })
  .inputValidator((value: { key: string }) => {
    if (!isVisitorKey(value.key)) throw new Error("invalid visitor key");
    return { key: value.key.toLowerCase() };
  })
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    if (
      !(await consumeLimits([
        {
          bucket: "tour:start",
          subject: clientIp(getRequest()),
          limit: 30,
          windowSeconds: 3600,
        },
      ]))
    )
      return null;
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { issueTourVisitToken } = await import("./archy-tour-visits.server");
    const id = crypto.randomUUID();
    const token = await issueTourVisitToken(id);
    const { error } = await supabaseAdmin
      .from("archy_tour_visits")
      .insert({ id, visitor_key: data.key });
    return error ? null : { token };
  });

export const updateTourVisit = createServerFn({ method: "POST" })
  .inputValidator(
    (value: {
      token: string;
      action: "completed" | "chat";
      access?: string;
    }) => {
      if (
        typeof value.token !== "string" ||
        value.token.length > 4096 ||
        !["completed", "chat"].includes(value.action)
      )
        throw new Error("invalid tour event");
      return {
        token: value.token,
        action: value.action,
        access:
          typeof value.access === "string" ? value.access.slice(0, 4096) : "",
      };
    },
  )
  .handler(async ({ data }) => {
    const { verifyTourVisitToken, tourVisitorIdentity } =
      await import("./archy-tour-visits.server");
    const id = await verifyTourVisitToken(data.token);
    if (!id) return { ok: false };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    if (
      !(await consumeLimits([
        {
          bucket: "tour:update",
          subject: clientIp(getRequest()),
          limit: 120,
          windowSeconds: 3600,
        },
      ]))
    )
      return { ok: false };
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("archy_tour_visits")
      .select("started_at,completed_at,chat_opened_at,visitor_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) return { ok: false };
    const identity =
      data.action === "chat" && row.completed_at
        ? await tourVisitorIdentity(data.access)
        : null;
    // A signed tour cannot be rebound to another guest by reopening the gate.
    if (identity && row.visitor_id && row.visitor_id !== identity.visitor_id)
      return { ok: false };
    const patch = { ...tourVisitPatch(row, data.action), ...(identity ?? {}) };
    if (!Object.keys(patch).length) return { ok: true };
    const result = await supabaseAdmin
      .from("archy_tour_visits")
      .update(patch)
      .eq("id", id);
    return { ok: !result.error };
  });

export const listTourVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TourVisit[]> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("archy_tour_visits")
      .select(
        "id,visitor_key,started_at,completed_at,chat_opened_at,visitor_name,visitor_email,support_request_id,support_submitted_at",
      )
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("tour visits load failed");
    return data ?? [];
  });
