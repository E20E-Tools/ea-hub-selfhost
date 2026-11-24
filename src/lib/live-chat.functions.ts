import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanMessage, isUuid, isWithPerson } from "./live-chat.shared";
import { ipEmailSubject } from "./ai-budget.shared";

/** Live-chat quotas: the pass email is typed, so it is always paired with the client IP. */
async function visitorLimitKey(email: string): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { clientIp } = await import("./rate-limit.server");
  return ipEmailSubject(clientIp(getRequest()), email);
}

export type LiveResult =
  | { ok: true; chatId: string }
  | { ok: false; code: "gate" | "failed" | "limit" | "closed" };

function visitorInput(value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    access: typeof source["access"] === "string" ? source["access"] : "",
    language: source["language"] === "en" ? "en" : "ar",
    chatId: isUuid(source["chatId"]) ? source["chatId"] : "",
    body: cleanMessage(source["body"]),
    offset:
      typeof source["offset"] === "number" &&
      Number.isSafeInteger(source["offset"]) &&
      source["offset"] >= 0
        ? source["offset"]
        : 0,
  };
}

async function sameOrigin(): Promise<boolean> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const site = getRequest().headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** Visitor asks to talk to a person: the open chat moves to "waiting" and admins are alerted. */
export const requestHumanChat = createServerFn({ method: "POST" })
  .inputValidator(visitorInput)
  .handler(async ({ data }): Promise<LiveResult> => {
    if (!(await sameOrigin())) return { ok: false, code: "failed" };
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor(
      { supabase: null, userId: "" },
      data.access,
    );
    if (!visitor) return { ok: false, code: "gate" };
    const { consumeLimits } = await import("./rate-limit.server");
    if (
      !(await consumeLimits([
        {
          bucket: "live:request",
          subject: await visitorLimitKey(visitor.email),
          limit: 6,
          windowSeconds: 3600,
        },
      ]))
    )
      return { ok: false, code: "limit" };
    try {
      const db = await live.adminClient();
      const chat = await live.openChatFor(db, {
        ...visitor,
        language: data.language,
      });
      if (!isWithPerson(chat.status)) {
        await live.appendMessages(
          db,
          chat.id,
          [{ sender: "system", body: "requested" }],
          {
            status: "waiting",
            requested_at: new Date().toISOString(),
            visitor_name: visitor.name,
          },
        );
      }
      return { ok: true, chatId: chat.id };
    } catch (error) {
      console.error(
        "live chat request failed",
        error instanceof Error ? error.message : "unknown",
      );
      return { ok: false, code: "failed" };
    }
  });

/** Visitor message to the person handling their chat. */
export const sendVisitorLiveMessage = createServerFn({ method: "POST" })
  .inputValidator(visitorInput)
  .handler(async ({ data }): Promise<LiveResult> => {
    if (!(await sameOrigin()) || !data.chatId || !data.body)
      return { ok: false, code: "failed" };
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor(
      { supabase: null, userId: "" },
      data.access,
    );
    if (!visitor) return { ok: false, code: "gate" };
    const { checkLimits } = await import("./rate-limit.server");
    const key = await visitorLimitKey(visitor.email);
    const pace = await checkLimits([
      { bucket: "live:msg-min", subject: key, limit: 15, windowSeconds: 60 },
      {
        bucket: "live:msg-day",
        subject: key,
        limit: 300,
        windowSeconds: 86_400,
      },
    ]);
    if (pace !== "ok")
      return { ok: false, code: pace === "limited" ? "limit" : "failed" };
    const db = await live.adminClient();
    const { data: chat } = await db
      .from("live_chats")
      .select("id, status")
      .eq("id", data.chatId)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (!chat || !isWithPerson(chat.status))
      return { ok: false, code: "closed" };
    try {
      await live.appendMessages(db, chat.id, [
        { sender: "visitor", body: data.body },
      ]);
      return { ok: true, chatId: chat.id };
    } catch {
      return { ok: false, code: "failed" };
    }
  });

/** Visitor ends the conversation with a person and goes back to the AI guide. */
export const endVisitorLiveChat = createServerFn({ method: "POST" })
  .inputValidator(visitorInput)
  .handler(async ({ data }): Promise<LiveResult> => {
    if (!(await sameOrigin()) || !data.chatId)
      return { ok: false, code: "failed" };
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor(
      { supabase: null, userId: "" },
      data.access,
    );
    if (!visitor) return { ok: false, code: "gate" };
    const db = await live.adminClient();
    const { data: chat } = await db
      .from("live_chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (!chat) return { ok: false, code: "failed" };
    await live.appendMessages(
      db,
      chat.id,
      [{ sender: "system", body: "closed" }],
      {
        status: "closed",
      },
    );
    return { ok: true, chatId: chat.id };
  });

function adminInput(value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (!isUuid(source["chatId"])) throw new Error("bad chat");
  return { chatId: source["chatId"], body: cleanMessage(source["body"]) };
}

/** Admin reply; the first reply marks the chat active and records who joined. */
export const adminSendLiveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminInput)
  .handler(async ({ data, context }) => {
    const { requireAdmin, actorEmail } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    if (!data.body) throw new Error("empty");
    const live = await import("./live-chat.server");
    const db = await live.adminClient();
    const { data: chat, error } = await db
      .from("live_chats")
      .select("id, status")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error || !chat) throw new Error("not found");
    const joining = chat.status !== "active";
    await live.appendMessages(
      db,
      chat.id,
      [
        ...(joining ? [{ sender: "system" as const, body: "joined" }] : []),
        { sender: "admin", body: data.body },
      ],
      joining
        ? { status: "active", admin_email: actorEmail(context.claims) }
        : {},
    );
    // Expired chats are purged by the daily cleanup job, never during a reply.
    return { ok: true };
  });

export const adminCloseLiveChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminInput)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const live = await import("./live-chat.server");
    const db = await live.adminClient();
    await live.appendMessages(
      db,
      data.chatId,
      [{ sender: "system", body: "closed" }],
      {
        status: "closed",
      },
    );
    return { ok: true };
  });

/** Manual routing: an admin takes a visitor's open chat away from the AI. */
export const adminTakeOverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => {
    const id =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)["chatId"]
        : null;
    if (!isUuid(id)) throw new Error("bad chat");
    return { chatId: id };
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin, actorEmail } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const live = await import("./live-chat.server");
    const db = await live.adminClient();
    const { data: chat, error } = await db
      .from("live_chats")
      .select("id, status")
      .eq("id", data.chatId)
      .maybeSingle();
    if (error || !chat) throw new Error("not found");
    if (chat.status === "closed") throw new Error("closed");
    if (chat.status !== "active")
      await live.appendMessages(
        db,
        chat.id,
        [{ sender: "system", body: "joined" }],
        {
          status: "active",
          admin_email: actorEmail(context.claims),
        },
      );
    return { ok: true };
  });

export type VisitorSupportRow = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
};

/** Only requests explicitly linked to this conversation, never inferred from typed email. */
export const adminChatVisitorSupport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => {
    const chatId =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)["chatId"]
        : "";
    if (!isUuid(chatId)) throw new Error("bad chat");
    return { chatId };
  })
  .handler(async ({ data, context }): Promise<VisitorSupportRow[]> => {
    const { requireAdmin } = await import("./admin-guard.server");
    await requireAdmin(context as never);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin
      .from("suggestion_requests")
      .select("id, request_type, status, created_at")
      .eq("details->>chatId", data.chatId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (r.error) throw new Error("support load failed");
    return [
      ...(r.data ?? []).map((x) => ({
        id: x.id,
        kind: x.request_type,
        status: x.status,
        created_at: x.created_at,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  });

/** Private guest reads are authorized by the signed, server-minted visitor identity. */
export const readVisitorChats = createServerFn({ method: "POST" })
  .inputValidator(visitorInput)
  .handler(async ({ data }) => {
    const empty = {
      chats: [] as {
        id: string;
        status: string;
        created_at: string;
        last_message_at: string;
      }[],
      messages: [] as {
        id: string;
        chat_id: string;
        sender: string;
        body: string;
        created_at: string;
      }[],
      hasMore: false,
    };
    if (!(await sameOrigin())) return empty;
    const live = await import("./live-chat.server");
    const visitor = await live.verifyVisitor(
      { supabase: null, userId: "" },
      data.access,
    );
    if (!visitor) return empty;
    const db = await live.adminClient();
    let query = db
      .from("live_chats")
      .select("id, status, created_at, last_message_at")
      .eq("visitor_id", visitor.id);
    if (data.chatId) query = query.eq("id", data.chatId);
    const { data: found, error } = await query
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.chatId ? 0 : data.offset, data.chatId ? 0 : data.offset + 50);
    if (error) throw new Error("chat load failed");
    if (!found?.length) return empty;
    const chats = found.slice(0, 50);
    // List reads do not download entire histories. Detail/poll reads check ownership first.
    if (!data.chatId) return { ...empty, chats, hasMore: found.length > 50 };
    const { data: messages, error: messageError } = await db
      .from("live_chat_messages")
      .select("id, chat_id, sender, body, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.offset, data.offset + 100);
    if (messageError) throw new Error("message load failed");
    return {
      chats,
      messages: (messages ?? []).slice(0, 100).reverse(),
      hasMore: (messages?.length ?? 0) > 100,
    };
  });
