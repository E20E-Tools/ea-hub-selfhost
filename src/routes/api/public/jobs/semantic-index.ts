import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const noStore = { "Cache-Control": "no-store" };

/**
 * Daily semantic-index refresh: re-embeds only changed products, release notes and approved
 * FAQ answers, and drops passages that no longer exist. Skips quietly without OPENAI_API_KEY.
 *
 * Vercel Cron calls it with GET and `Authorization: Bearer $CRON_SECRET` (see vercel.json);
 * POST stays available for other schedulers.
 */
async function runSemanticIndex(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;
  const { reindexSemantic, semanticConfigured } =
    await import("@/lib/semantic.server");
  if (!semanticConfigured())
    return Response.json({ ok: true, skipped: true }, { headers: noStore });
  try {
    const result = await reindexSemantic();
    return Response.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.error("semantic index failed", reason);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { SYSTEM_ACTOR_ID } = await import("@/lib/rate-limit.server");
    await supabaseAdmin.from("admin_activity").insert({
      actor_id: SYSTEM_ACTOR_ID,
      actor_email: "system",
      action: "semantic.index_failed",
      target: reason.slice(0, 60),
    });
    return Response.json({ ok: false }, { status: 500, headers: noStore });
  }
}

export const Route = createFileRoute("/api/public/jobs/semantic-index")({
  server: {
    handlers: {
      GET: ({ request }) => runSemanticIndex(request),
      POST: ({ request }) => runSemanticIndex(request),
    },
  },
});
