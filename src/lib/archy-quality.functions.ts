import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin(
  context: Parameters<typeof import("./admin-guard.server").requireAdmin>[0],
) {
  const { requireAdmin } = await import("./admin-guard.server");
  await requireAdmin(context);
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
export const rateArchyReply = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      access: z.string().max(8000),
      helpful: z.boolean(),
      reason: z.enum(["fit", "incomplete", "other"]).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor(
      { supabase: null, userId: "" },
      data.access,
    );
    if (!visitor) throw new Error("Access expired");
    const db = await live.adminClient();
    const message = await db
      .from("live_chat_messages")
      .select("chat_id,live_chats!inner(visitor_id)")
      .eq("id", data.id)
      .eq("sender", "ai")
      .eq("live_chats.visitor_id", visitor.id)
      .maybeSingle();
    if (message.error || !message.data) throw new Error("Message unavailable");
    const result = await db
      .from("live_chat_messages")
      .update({
        helpful: data.helpful,
        feedback_reason: data.helpful ? null : data.reason,
      })
      .eq("id", data.id)
      .eq("chat_id", message.data.chat_id);
    if (result.error) throw new Error("Rating failed");
    return true;
  });
export const archyQuality = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [cases, totals, negative] = await Promise.all([
      db.from("archy_cases").select("*").order("language").order("question"),
      db.from("archy_feedback_totals").select("*"),
      db
        .from("live_chat_messages")
        .select("id,reply_language,feedback_reason,prompt_id")
        .eq("helpful", false)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (cases.error || totals.error || negative.error)
      throw new Error("Quality data unavailable");
    const ids = negative.data.flatMap((row) =>
      row.prompt_id ? [row.prompt_id] : [],
    );
    const prompts = ids.length
      ? await db.from("live_chat_messages").select("id,body").in("id", ids)
      : { data: [], error: null };
    if (prompts.error) throw new Error("Questions unavailable");
    const questions = new Map(prompts.data?.map((p) => [p.id, p.body]));
    return {
      cases: cases.data,
      totals: totals.data,
      recent: negative.data.map((row) => ({
        id: row.id,
        language: row.reply_language,
        reason: row.feedback_reason,
        question: (questions.get(row.prompt_id ?? "") ?? "")
          .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[…] ")
          .replace(/\+?[\d٠-٩][\d٠-٩ ()-]{6,}[\d٠-٩]/g, "[…] "),
      })),
    };
  });
export const saveArchyCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      expected:z.string().trim().max(800).optional(),
      question: z.string().trim().min(1).max(1200),
      language: z.enum(["ar", "en"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const r = await db
      .from("archy_cases")
      .upsert({question:data.question,language:data.language,...(data.expected===undefined?{}:{expected:data.expected})}, {
        onConflict: "language,question",
        defaultToNull:false,
      });
    if (r.error) throw new Error("Save failed");
    return true;
  });
export const removeArchyCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const r = await db.from("archy_cases").delete().eq("id", data);
    if (r.error) throw new Error("Delete failed");
    return true;
  });
export const getProductReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const r = await db.from("product_reviews").select("*");
    if (r.error) throw new Error("Reviews unavailable");
    return r.data;
  });
export const setProductReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      product_id: z.string().min(1).max(100),
      reviewed_on: z
        .string()
        .date()
        .refine((v) => v <= new Date().toISOString().slice(0, 10)),
    }),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const r = await db.from("product_reviews").upsert(data);
    if (r.error) throw new Error("Review failed");
    return true;
  });

export const archyHealth=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const db=await admin(context);
 const [visitor,tests,events]=await Promise.all([
 db.from("live_chat_messages").select("reply_source,reply_model,reply_ms,created_at").not("reply_source","is",null).order("created_at",{ascending:false}).limit(1),
 db.from("archy_probe").select("*").order("checked_at",{ascending:false}),
 db.from("archy_setting_events").select("actor,changes,created_at").order("created_at",{ascending:false}).limit(30)]);
 if(visitor.error||tests.error||events.error)throw Error("Health unavailable");
 return {visitor:visitor.data[0]??null,tests:tests.data,events:events.data};
});
