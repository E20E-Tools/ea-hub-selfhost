import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/newsletter")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Constant-time check that also accepts CRON_SECRET_PREVIOUS during rotation.
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        try {
          return Response.json(await (await import("@/lib/newsletter.server")).sendDue(), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      },
    },
  },
});
