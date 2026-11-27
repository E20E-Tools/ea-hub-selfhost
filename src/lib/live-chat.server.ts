// Server-only helpers for stored chats. All writes use the service client after the
// caller was verified; visitors and admins only read through row-level security.
import { type LiveChatSender } from "./live-chat.shared";
import { orderChatMessages } from "./chat-order";
import type { AssistantTurn } from "./assistant-chat.functions";

type Admin =
  (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export async function adminClient(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Returns the visitor's open chat (any status but closed), creating one when none exists. */
export async function openChatFor(
  db: Admin,
  visitor: { id: string; email: string; name: string; language: string },
): Promise<{ id: string; status: string }> {
  const findOpen = async () => {
    const { data, error } = await db
      .from("live_chats")
      .select("id, status")
      .eq("visitor_id", visitor.id)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  const existing = await findOpen();
  if (existing) return existing;
  // Expired chats are purged by the daily cleanup job (/api/public/jobs/daily-cleanup), so
  // starting a chat never takes the purge's lock on support requests.
  const start_page = await visitPage();
  const { data, error: insertError } = await db
    .from("live_chats")
    .insert({
      visitor_id: visitor.id,
      visitor_email: visitor.email,
      visitor_name: visitor.name,
      language: visitor.language,
      start_page,
    })
    .select("id, status")
    .single();
  // A simultaneous request already opened this visitor's chat (one open chat per visitor is
  // enforced by a unique index): continue in that conversation instead of failing.
  if (insertError?.code === "23505") {
    const winner = await findOpen();
    if (winner) return winner;
  }
  if (insertError) throw insertError;
  return data;
}

/** Most recent visitor/AI messages the model may see from one conversation. */
export const ASSISTANT_CONTEXT_LIMIT = 12;

type ContextRow = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
};

/** Orders stored messages chronologically and maps visitor → user, ai → assistant. */
export function turnsFromMessages(
  rows: readonly ContextRow[],
): AssistantTurn[] {
  return orderChatMessages(
    rows.filter((row) => row.sender === "visitor" || row.sender === "ai"),
  )
    .slice(-ASSISTANT_CONTEXT_LIMIT)
    .map((row) =>
      row.sender === "visitor"
        ? { role: "user" as const, content: row.body.trim().slice(0, 1200) }
        : {
            role: "assistant" as const,
            content: row.body.trim().slice(0, 4000),
          },
    )
    .filter((turn) => turn.content.length > 0);
}

/**
 * Server-stored context for the visitor's current open conversation only (the same chat
 * openChatFor reuses). No open chat means no history; read errors are thrown so the
 * caller fails closed instead of answering with partial context.
 */
export async function openChatContext(
  db: Admin,
  visitorId: string,
): Promise<AssistantTurn[]> {
  const { data: chat, error } = await db
    .from("live_chats")
    .select("id")
    .eq("visitor_id", visitorId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!chat) return [];
  const { data: rows, error: messagesError } = await db
    .from("live_chat_messages")
    .select("id, sender, body, created_at")
    .eq("chat_id", chat.id)
    .in("sender", ["visitor", "ai"])
    .order("created_at", { ascending: false })
    .limit(ASSISTANT_CONTEXT_LIMIT);
  if (messagesError) throw messagesError;
  return turnsFromMessages(rows ?? []);
}

export async function appendMessages(
  db: Admin,
  chatId: string,
  messages: {
    id?: string;
    sender: LiveChatSender;
    body: string;
    prompt_id?: string;
    reply_source?: string;
    reply_model?: string | null;
    reply_ms?: number;
    reply_language?: string;
  }[],
  patch: Record<string, unknown> = {},
): Promise<void> {
  const rows = messages
    .filter((m) => m.body)
    .map((m) => ({ chat_id: chatId, ...m }));
  if (rows.length) {
    const { error } = await db.from("live_chat_messages").insert(rows);
    if (error) throw error;
  }
  // Visitor actions arrive from the page they are reading; admin replies never overwrite it.
  const fromVisitor = messages.some(
    (m) =>
      m.sender === "visitor" ||
      (m.sender === "system" && m.body === "requested"),
  );
  const last_page = fromVisitor ? await visitPage() : "";
  const { error } = await db
    .from("live_chats")
    .update({
      last_message_at: new Date().toISOString(),
      ...(last_page ? { last_page } : {}),
      ...patch,
    })
    .eq("id", chatId);
  if (error) throw error;
}

/** Guest tokens carry a server-minted identity; legacy tokens still need confirmed account ownership. */
export async function verifyVisitor(
  context: { supabase: unknown; userId: string },
  access: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const { verifyAccessToken, gateSecrets } =
    await import("./assistant-gate.server");
  const token = await verifyAccessToken(await gateSecrets(), access);
  if (!token) return null;
  if (token.visitorId)
    return { id: token.visitorId, email: token.email, name: token.name };
  if (!context.supabase || !context.userId) return null;
  const supabase = context.supabase as {
    auth: {
      getUser: () => Promise<{
        data: {
          user: { email?: string; email_confirmed_at?: string | null } | null;
        };
      }>;
    };
  };
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email_confirmed_at
    ? data.user.email?.trim().toLowerCase()
    : null;
  if (!email || email !== token.email.trim().toLowerCase()) return null;
  return { id: context.userId, email, name: token.name };
}

/** Site path the visitor was on when the chat started, read from the same-site Referer. */
export async function visitPage(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const ref = req.headers.get("referer");
    if (!ref) return "";
    const url = new URL(ref);
    if (url.host !== new URL(req.url).host) return "";
    // Collapse leading slashes: "//host/x" would render as a protocol-relative external link.
    return ("/" + url.pathname.replace(/^\/+/, "") + url.search).slice(0, 300);
  } catch {
    return "";
  }
}
