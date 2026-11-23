import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Daily retention job, called only by the managed schedule: expired chats, rate-limit
 * history older than 7 days, and visits/telemetry past their retention days, in bounded
 * batches. The database function logs the result in the admin activity log.
 */
export const Route = createFileRoute("/api/public/jobs/daily-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_daily_maintenance", {
          _batch: 5000,
        });
        if (error) {
          console.error("daily cleanup failed", error.code);
          const { SYSTEM_ACTOR_ID } = await import("@/lib/rate-limit.server");
          await supabaseAdmin.from("admin_activity").insert({
            actor_id: SYSTEM_ACTOR_ID,
            actor_email: "system",
            action: "retention.daily_cleanup_failed",
            target: String(error.code ?? "unknown").slice(0, 60),
          });
          return Response.json({ ok: false }, { status: 500 });
        }
        return Response.json({ ok: true, removed: data });
      },
    },
  },
});
