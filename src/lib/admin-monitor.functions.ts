import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CHAT_GLOBAL_BUCKET,
  CHAT_GLOBAL_DAY_LIMIT,
  RECOMMEND_GLOBAL_BUCKET,
  RECOMMEND_GLOBAL_DAY_LIMIT,
} from "./ai-budget.shared";
import type { AiUsageView, AssistantReplyRow } from "./admin-monitor.shared";

/** Counts admitted requests, not completed answers; never exposes hashed visitor subjects. */
export const getAdminAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiUsageView> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const counts = await Promise.all(
      [CHAT_GLOBAL_BUCKET, RECOMMEND_GLOBAL_BUCKET, "chat:ban"].map(async (bucket) => {
        const { count, error } = await supabaseAdmin
          .from("rate_limit_events")
          .select("id", { count: "exact", head: true })
          .eq("bucket", bucket)
          .gte("created_at", since);
        if (error || count === null) throw new Error("تعذّر تحميل استهلاك المساعد.");
        return count;
      }),
    );
    return {
      since,
      chat: counts[0] ?? 0,
      recommendations: counts[1] ?? 0,
      bans: counts[2] ?? 0,
      chatLimit: CHAT_GLOBAL_DAY_LIMIT,
      recommendationLimit: RECOMMEND_GLOBAL_DAY_LIMIT,
    };
  });

/** Latest AI replies, read from the stored chats (sender "ai") with each chat's visitor. */
export const listAssistantReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssistantReplyRow[]> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("live_chat_messages")
      .select("id, body, created_at, live_chats!inner(visitor_email, visitor_name, language)")
      .eq("sender", "ai")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("تعذّر تحميل ردود المساعد.");
    return (data ?? []).map(toAssistantReplyRow);
  });

type AiMessageRow = {
  id: string;
  body: string;
  created_at: string;
  live_chats:
    | { visitor_email: string; visitor_name: string; language: string }
    | { visitor_email: string; visitor_name: string; language: string }[]
    | null;
};

export function toAssistantReplyRow(row: AiMessageRow): AssistantReplyRow {
  const chat = Array.isArray(row.live_chats) ? row.live_chats[0] : row.live_chats;
  return {
    id: row.id,
    visitor_email: chat?.visitor_email ?? "",
    visitor_name: chat?.visitor_name ?? "",
    reply: row.body,
    language: chat?.language ?? "",
    created_at: row.created_at,
  };
}
