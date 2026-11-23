/** Visitor days are counted on Riyadh time (UTC+3, no daylight saving). */
export function riyadhDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export const VISITOR_KEY_STORAGE = "e20e-visitor-key-v1";
export const VISIT_DAY_STORAGE = "e20e-visit-day-v1";

export function isVisitorKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export type VisitStats = {
  day: string;
  today: number;
  returning: number;
  chatted: number;
  requested: number;
  contacts: { email: string; name: string; chat: boolean; request: boolean }[];
};

/** Today's contacts: visitors (by email) who opened a chat or sent a request today. */
export function summarizeContacts(
  chats: { visitor_email: string; visitor_name: string }[],
  requests: { email: string; name: string }[],
): Pick<VisitStats, "chatted" | "requested" | "contacts"> {
  const map = new Map<string, VisitStats["contacts"][number]>();
  const get = (email: string, name: string) => {
    const key = email.trim().toLowerCase();
    const row = map.get(key) ?? { email: key, name, chat: false, request: false };
    if (!row.name && name) row.name = name;
    map.set(key, row);
    return row;
  };
  for (const c of chats) if (c.visitor_email) get(c.visitor_email, c.visitor_name).chat = true;
  for (const r of requests) if (r.email) get(r.email, r.name).request = true;
  const contacts = [...map.values()];
  return {
    chatted: contacts.filter((c) => c.chat).length,
    requested: contacts.filter((c) => c.request).length,
    contacts,
  };
}
