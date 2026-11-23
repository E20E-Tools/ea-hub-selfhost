import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/jobs/newsletter")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (
          !secret ||
          request.headers.get("authorization") !== "Bearer " + secret
        )
          return new Response(null, { status: 401 });
        try {
          return Response.json(
            await (await import("@/lib/newsletter.server")).sendDue(),
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      },
    },
  },
});
