import type { AssistantTurn } from "./assistant-chat.functions";
import type { RecommendationPick } from "./recommend.shared";

export type StoredMessage = AssistantTurn & { messageId?:string; picks?: RecommendationPick[]; error?: boolean };
export type StoredSession = { token: string; name: string; exp: number; email?: string };
export const GUEST_CHAT_OWNER = "guest-v2";

/** Unscoped keys from earlier versions; their owner is unknown so they are only ever deleted. */
export const LEGACY_KEYS = ["e20e-assistant-chat", "e20e-assistant-access"] as const;

export function historyKey(userId: string) {
  return `e20e-assistant-chat:${userId}`;
}
export function sessionKey(userId: string) {
  return `e20e-assistant-access:${userId}`;
}

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function parseSession(raw: string | null, now = Date.now()): StoredSession | null {
  const value = parse(raw) as Record<string, unknown> | null;
  if (
    !value ||
    typeof value["token"] !== "string" ||
    !value["token"] ||
    typeof value["name"] !== "string" ||
    typeof value["exp"] !== "number" ||
    !(value["exp"] > now)
  )
    return null;
  return {
    token: value["token"],
    name: value["name"],
    exp: value["exp"],
    ...(typeof value["email"] === "string" ? { email: value["email"] } : {}),
  };
}

export function parseHistory(raw: string | null): StoredMessage[] {
  const value = parse(raw);
  if (!Array.isArray(value)) return [];
  const out: StoredMessage[] = [];
  for (const item of value.slice(-40)) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry["role"] !== "user" && entry["role"] !== "assistant") continue;
    if (typeof entry["content"] !== "string") continue;
    const message: StoredMessage = {
      role: entry["role"],
      content: entry["content"].slice(0, 4000),
    };
    if(typeof entry["messageId"] === "string") message.messageId=entry["messageId"];
    if (entry["error"] === true) message.error = true;
    if (Array.isArray(entry["picks"])) {
      message.picks = entry["picks"]
        .filter(
          (p): p is RecommendationPick =>
            !!p &&
            typeof p === "object" &&
            typeof (p as Record<string, unknown>)["id"] === "string" &&
            typeof (p as Record<string, unknown>)["reason"] === "string",
        )
        .slice(0, 3)
        .map((p) => ({ id: p.id, reason: p.reason }));
    }
    out.push(message);
  }
  return out;
}

export function clearLegacy(store: KeyStore) {
  for (const key of LEGACY_KEYS) {
    try {
      store.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}

/** Loads only the given account's state; expired or malformed sessions are removed. */
export function loadAccountState(store: KeyStore, userId: string, now = Date.now()) {
  let session: StoredSession | null = null;
  let history: StoredMessage[] = [];
  try {
    session = parseSession(store.getItem(sessionKey(userId)), now);
    if (!session) store.removeItem(sessionKey(userId));
    history = parseHistory(store.getItem(historyKey(userId)));
  } catch {
    /* storage unavailable */
  }
  return { session, history };
}
