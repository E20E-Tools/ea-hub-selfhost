/** Browser-safe live chat rules shared by the visitor widget, admin screen and tests. */
export const LIVE_CHAT_STATUSES = ["ai", "waiting", "active", "closed"] as const;
export type LiveChatStatus = (typeof LIVE_CHAT_STATUSES)[number];
export type LiveChatSender = "visitor" | "ai" | "admin" | "system";
/** System messages are stored as codes and shown in the reader's language. */
export type LiveSystemCode = "requested" | "joined" | "closed";

/** Chats (and their messages) are kept for three months after their last message. */
export const LIVE_CHAT_RETENTION_DAYS = 90;
export const LIVE_MESSAGE_MAX = 2000;

export function retentionCutoff(now: number = Date.now()): string {
  return new Date(now - LIVE_CHAT_RETENTION_DAYS * 86_400_000).toISOString();
}

/** A visitor's messages go to a person (not the AI) while the chat is waiting or active. */
export function isWithPerson(status: string | null | undefined): boolean {
  return status === "waiting" || status === "active";
}

export function cleanMessage(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, LIVE_MESSAGE_MAX) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
