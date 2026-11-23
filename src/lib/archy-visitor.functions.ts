import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ArchyVisitorSummary = {
  email: string;
  name: string;
  chats: number;
  openSupport: number;
  /** The visitor's latest support requests (newest first, max 3). */
  support: { id: string; status: string; createdAt: string; updatedAt: string | null }[];
};

/** The signed-in visitor's own summary for Archy's guide card: never another visitor's data. */
export const getMyArchySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ArchyVisitorSummary | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = account.user?.email_confirmed_at ? account.user.email?.toLowerCase() : null;
    if (!email) return null;
    // Chats are read as the caller and filtered to their own rows (admins can read all); support requests are service-only rows
    // matched on the caller's own confirmed email.
    const [chats, latest, support, recent] = await Promise.all([
      context.supabase
        .from("live_chats")
        .select("id", { count: "exact", head: true })
        .eq("visitor_id", context.userId),
      context.supabase
        .from("live_chats")
        .select("visitor_name")
        .eq("visitor_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("suggestion_requests")
        .select("id", { count: "exact", head: true })
        .ilike(
          "email",
          email.replace(/[\\%_]/g, (c) => `\\${c}`),
        )
        .eq("request_type", "support")
        .in("status", ["new", "in_progress"]),
      supabaseAdmin
        .from("suggestion_requests")
        .select("id, status, created_at, status_updated_at")
        .ilike(
          "email",
          email.replace(/[\\%_]/g, (c) => `\\${c}`),
        )
        .eq("request_type", "support")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    return {
      email,
      name: latest.data?.visitor_name ?? "",
      chats: chats.count ?? 0,
      openSupport: support.count ?? 0,
      support: (recent.data ?? []).map((r) => ({
        id: r.id.slice(0, 8),
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.status_updated_at,
      })),
    };
  });
