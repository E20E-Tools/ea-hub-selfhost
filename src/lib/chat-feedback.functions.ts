import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanStars, cleanText } from "./chat-feedback.shared";
import { isUuid } from "./live-chat.shared";

export type RateResult = { ok: true } | { ok: false; code: "gate" | "failed" | "limit" };

/** Guest rating reads use the same signed identity as writes, not account-based browser RLS. */
export const readVisitorRating = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      access: typeof s["access"] === "string" ? s["access"] : "",
      chatId: isUuid(s["chatId"]) ? s["chatId"] : "",
    };
  })
  .handler(async ({ data }): Promise<{ stars: number; comment: string } | null> => {
    if (!data.chatId) return null;
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor({ supabase: null, userId: "" }, data.access);
    if (!visitor) return null;
    const db = await live.adminClient();
    const { data: chat, error } = await db
      .from("live_chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (error) throw new Error("chat load failed");
    if (!chat) return null;
    const result = await db
      .from("live_chat_ratings")
      .select("stars, comment")
      .eq("chat_id", chat.id)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (result.error) throw new Error("rating load failed");
    return result.data;
  });

/** Visitor rates one of their own chats (team or tool guide); rating again replaces it. */
export const rateLiveChat = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      access: typeof s["access"] === "string" ? s["access"] : "",
      chatId: isUuid(s["chatId"]) ? s["chatId"] : "",
      stars: cleanStars(s["stars"]),
      comment: cleanText(s["comment"], 500),
    };
  })
  .handler(async ({ data }): Promise<RateResult> => {
    if (!data.chatId || data.stars === null) return { ok: false, code: "failed" };
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor({ supabase: null, userId: "" }, data.access);
    if (!visitor) return { ok: false, code: "gate" };
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { ipEmailSubject } = await import("./ai-budget.shared");
    if (
      !(await consumeLimits([
        {
          bucket: "live:rate",
          subject: ipEmailSubject(clientIp(getRequest()), visitor.email),
          limit: 20,
          windowSeconds: 3600,
        },
      ]))
    )
      return { ok: false, code: "limit" };
    const db = await live.adminClient();
    const { data: chat } = await db
      .from("live_chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (!chat) return { ok: false, code: "failed" };
    const { error } = await db.from("live_chat_ratings").upsert({
      chat_id: chat.id,
      visitor_id: visitor.id,
      stars: data.stars,
      comment: data.comment,
      updated_at: new Date().toISOString(),
    });
    return error ? { ok: false, code: "failed" } : { ok: true };
  });

/** Admin saves (creates or edits) an approved answer the tool guide will use. */
export const saveFaqAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => {
    const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const question = cleanText(s["question"], 500);
    const answer = typeof s["answer"] === "string" ? s["answer"].trim().slice(0, 2000) : "";
    if (!question || !answer) throw new Error("missing");
    return {
      id: isUuid(s["id"]) ? s["id"] : null,
      question,
      answer,
      enabled: s["enabled"] !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin, actorEmail } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      question: data.question,
      answer: data.answer,
      enabled: data.enabled,
      updated_by: actorEmail(context.claims),
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabaseAdmin.from("faq_answers").update(row).eq("id", data.id)
      : await supabaseAdmin.from("faq_answers").insert(row);
    if (error) throw new Error("save failed");
    return { ok: true };
  });

export const deleteFaqAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => {
    const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    if (!isUuid(s["id"])) throw new Error("bad id");
    return { id: s["id"] };
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("faq_answers").delete().eq("id", data.id);
    if (error) throw new Error("delete failed");
    return { ok: true };
  });
