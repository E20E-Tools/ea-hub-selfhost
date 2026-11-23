import { createServerFn } from "@tanstack/react-start";
import { REQUEST_STATUSES } from "./requests.shared";
import { z } from "zod";

const inputSchema = z.object({ access: z.string().max(4096).default("") });
export type TrackedRequest = {
  id: string;
  pending_question?: string;
  exercise?:string;
  request_type: string;
  need: string;
  product_id: string | null;
  created_at: string;
  status: string;
  status_updated_at: string | null;
  attachmentCount: number;
  chatId: string;
};
export type TrackedChat = {
  id: string;
  status: string;
  created_at: string;
  last_message_at: string;
  start_page: string | null;
  last_page: string | null;
};
export type TrackedMessage = {
  id: string;
  chat_id: string;
  sender: string;
  body: string;
  created_at: string;
};
export type TrackedReply = { id: string; request_id: string; body: string; created_at: string; author_kind?:string };

/** Overview list sizes. Lists report `…HasMore` so the page never implies a complete history. */
export const TRACKING_LIMITS = { requests: 100, chats: 50, replies: 200, historyPage: 50 } as const;

async function trackingIdentity(access: string) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const site = getRequest().headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return null;
  const { resolveRequestIdentity } = await import("./request-identity.server");
  try {
    return await resolveRequestIdentity(access) ?? (await import("./contact-owner.server")).contactOwner();
  } catch {
    return null;
  }
}

/**
 * One read-only overview over the existing stores; both guest and account ownership are verified.
 * Chat messages are not included: each conversation's full history is paged separately through
 * getMyChatHistory after an ownership check, so older conversations stay readable.
 */
export const getMyJourney = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => inputSchema.parse(value ?? {}))
  .handler(async ({ data }) => {
    const identity = await trackingIdentity(data.access);
    if (!identity) return { status: "unauthorized" as const };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const ownerColumn = identity.kind === "account" ? "account_id" : "visitor_id";
    const [links, chatRows] = await Promise.all([
      db
        .from("request_identities")
        .select("request_id")
        .eq(ownerColumn, identity.id)
        .order("created_at", { ascending: false })
        .limit(TRACKING_LIMITS.requests + 1),
      db
        .from("live_chats")
        .select("id,status,created_at,last_message_at,start_page,last_page")
        .eq("visitor_id", identity.id)
        .order("last_message_at", { ascending: false })
        .limit(TRACKING_LIMITS.chats + 1),
    ]);
    if (links.error || chatRows.error) throw new Error("trackingLoadFailed");
    const linkedIds = (links.data ?? [])
      .slice(0, TRACKING_LIMITS.requests)
      .map((row) => row.request_id);
    const chatsHasMore = (chatRows.data?.length ?? 0) > TRACKING_LIMITS.chats;
    const chats = ((chatRows.data ?? []) as TrackedChat[]).slice(0, TRACKING_LIMITS.chats);
    const chatIds = chats.map((chat) => chat.id);
    const select =
      "id,request_type,need,product_id,created_at,status,status_updated_at,pending_question,attachments,details";
    const reads = [];
    if (linkedIds.length)
      reads.push(db.from("suggestion_requests").select(select).in("id", linkedIds).limit(100));
    if (chatIds.length)
      reads.push(
        db.from("suggestion_requests").select(select).in("details->>chatId", chatIds).limit(100),
      );
    const requestResults = await Promise.all(reads);
    if (requestResults.some((result) => result.error)) throw new Error("trackingLoadFailed");
    const requestMap = new Map<string, TrackedRequest>();
    for (const result of requestResults)
      for (const row of result.data ?? []) {
        const details =
          row.details && typeof row.details === "object" && !Array.isArray(row.details)
            ? (row.details as Record<string, unknown>)
            : {};
        requestMap.set(row.id, {
          id: row.id,
          pending_question:row.pending_question,
          exercise:typeof details["exercise"]==="string"?details["exercise"]:"",
          request_type: row.request_type,
          need: row.need,
          product_id: row.product_id,
          created_at: row.created_at,
          status: row.status,
          status_updated_at: row.status_updated_at,
          attachmentCount: Array.isArray(row.attachments) ? row.attachments.length : 0,
          chatId: typeof details["chatId"] === "string" ? details["chatId"] : "",
        });
      }
    const allRequests = [...requestMap.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    const requestsHasMore =
      allRequests.length > TRACKING_LIMITS.requests ||
      (links.data?.length ?? 0) > TRACKING_LIMITS.requests;
    const requests = allRequests.slice(0, TRACKING_LIMITS.requests);
    const requestIds = requests.map((request) => request.id);
    const replies = requestIds.length
      ? await db
          .from("request_replies")
          .select("id,request_id,body,created_at,author_kind")
          .in("request_id", requestIds)
          .order("created_at", { ascending: false })
          .limit(TRACKING_LIMITS.replies + 1)
      : { data: [], error: null };
    const history = requestIds.length
      ? await db.from("admin_activity").select("id,target,action,created_at")
          .in("target", requestIds).in("action", REQUEST_STATUSES.map((status) => "request." + status))
          .order("created_at", { ascending: false }).limit(501)
      : { data: [], error: null };
    if (history.error) throw new Error("trackingLoadFailed");
    if (replies.error) throw new Error("trackingLoadFailed");
    return {
      status: "ok" as const,
      owner: identity.kind,
      requests,
      chats,
      replies: ((replies.data ?? []) as TrackedReply[]).slice(0, TRACKING_LIMITS.replies).reverse(),
      statusEvents: (history.data ?? []).slice(0, 500).map(row => ({
        id: row.id, requestId: row.target, at: row.created_at, status: row.action.slice("request.".length),
      })),
      historyHasMore: (history.data?.length ?? 0) > 500,
      requestsHasMore,
      chatsHasMore,
      repliesHasMore: (replies.data?.length ?? 0) > TRACKING_LIMITS.replies,
    };
  });

const historySchema = z.object({
  access: z.string().max(4096).default(""),
  chatId: z.string().uuid(),
  offset: z.number().int().min(0).max(10_000).default(0),
});

/** Newest-first pages of one conversation, only after confirming the caller owns that chat. */
export const getMyChatHistory = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => historySchema.parse(value ?? {}))
  .handler(async ({ data }) => {
    const identity = await trackingIdentity(data.access);
    if (!identity) return { status: "unauthorized" as const };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const owned = await db
      .from("live_chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("visitor_id", identity.id)
      .maybeSingle();
    if (owned.error) throw new Error("trackingLoadFailed");
    if (!owned.data) return { status: "not_found" as const };
    const size = TRACKING_LIMITS.historyPage;
    const page = await db
      .from("live_chat_messages")
      .select("id,chat_id,sender,body,created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(data.offset, data.offset + size);
    if (page.error) throw new Error("trackingLoadFailed");
    const rows = (page.data ?? []) as TrackedMessage[];
    return {
      status: "ok" as const,
      messages: rows.slice(0, size).reverse(),
      hasMore: rows.length > size,
      nextOffset: data.offset + Math.min(rows.length, size),
    };
  });

export const clarifyRequest=createServerFn({method:"POST"})
.inputValidator((input:unknown)=>inputSchema.extend({requestId:z.string().uuid(),noteId:z.string().uuid(),body:z.string().trim().min(2).max(1500)}).parse(input))
.handler(async({data})=>{
 const owner=await trackingIdentity(data.access);
 if(!owner)return {ok:false};
 const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
 const {data:link}=await db.from("request_identities").select("request_id").eq("request_id",data.requestId).eq(owner.kind==="account"?"account_id":"visitor_id",owner.id).maybeSingle();
 if(!link){
 const request=await db.from("suggestion_requests").select("details").eq("id",data.requestId).maybeSingle();
 const details=request.data?.details;
 const chatId=details && typeof details==="object" && !Array.isArray(details) ? details["chatId"] : null;
 if(typeof chatId!=="string")return {ok:false};
 const chat=await db.from("live_chats").select("id").eq("id",chatId).eq("visitor_id",owner.id).maybeSingle();
 if(!chat.data)return {ok:false};
 }
 const {checkLimits}=await import("./rate-limit.server");
 if(await checkLimits([{bucket:"request:clarify",subject:owner.id,limit:12,windowSeconds:3600}])!=="ok")return {ok:false};
 const row={id:data.noteId,request_id:data.requestId,body:data.body,author_kind:"visitor"};
 const {error}=await db.from("request_replies").insert(row);
 if(error?.code==="23505"){
 const old=await db.from("request_replies").select("id").eq("id",data.noteId).eq("request_id",data.requestId).eq("body",data.body).eq("author_kind","visitor").maybeSingle();
 return {ok:!!old.data};}
 return {ok:!error};
});
