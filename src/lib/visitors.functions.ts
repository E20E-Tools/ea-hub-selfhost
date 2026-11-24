import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeVisitors } from "./visitors.shared";

export const listVisitorProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    // Service-only registration rows and Auth account dates require privileged reads.
    // Paginate all sources rather than presenting truncated counts as totals.
    const registrations: { email: string; name: string; created_at: string }[] =
      [];
    const requests: {
      email: string;
      name: string;
      request_type: string;
      created_at: string;
      status: string;
    }[] = [];
    const chats: {
      id: string;
      status: string;
      last_message_at: string;
      last_page: string;
      start_page: string;
      visitor_email: string;
      visitor_name: string;
      created_at: string;
    }[] = [];
    const accounts: { email: string; created_at: string; verified: boolean }[] =
      [];
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw new Error("visitor load failed");
      for (const u of data.users)
        if (u.email)
          accounts.push({
            email: u.email,
            created_at: u.created_at,
            verified: Boolean(u.email_confirmed_at),
          });
      if (data.users.length < 1000) break;
    }
    for (let offset = 0; ; offset += 1000) {
      const [r, s, c] = await Promise.all([
        supabaseAdmin
          .from("assistant_registrations")
          .select("email,name,created_at")
          .order("id")
          .range(offset, offset + 999),
        supabaseAdmin
          .from("suggestion_requests")
          .select("email,name,request_type,created_at,status")
          .order("id")
          .range(offset, offset + 999),
        context.supabase
          .from("live_chats")
          .select(
            "id,status,last_message_at,last_page,start_page,visitor_email,visitor_name,created_at",
          )
          .order("id")
          .range(offset, offset + 999),
      ]);
      if (r.error || s.error || c.error) throw new Error("visitor load failed");
      registrations.push(...(r.data ?? []));
      requests.push(...(s.data ?? []));
      chats.push(...(c.data ?? []));
      if (
        (r.data?.length ?? 0) < 1000 &&
        (s.data?.length ?? 0) < 1000 &&
        (c.data?.length ?? 0) < 1000
      )
        break;
    }
    return summarizeVisitors(accounts, registrations, requests, chats);
  });
