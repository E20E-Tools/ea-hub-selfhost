/** Visitor days are counted on Riyadh time (UTC+3, no daylight saving). */
export function riyadhDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export const VISITOR_KEY_STORAGE = "e20e-visitor-key-v1";
export const VISIT_DAY_STORAGE = "e20e-visit-day-v1";
export const PRODUCT_VIEW_DAY_STORAGE = "e20e-product-view-day-v1";
/**
 * A browser that opened at least one product page on a day is stored as a second row in
 * site_visits with this prefix on the same random key. Visitor totals exclude these rows.
 */
export const PRODUCT_VIEW_PREFIX = "p:";

export type FunnelStage = "visitors" | "productViewers" | "chats" | "requests";
export type Funnel = {
  days: number;
  since: string;
  stages: { stage: FunnelStage; count: number }[];
  /** Requests that came from a coming-soon waitlist answer (part of `requests`). */
  waitlistRequests: number;
};

/** Percentage of the previous stage, rounded; null when the previous stage is empty. */
export function funnelSteps(stages: Funnel["stages"]) {
  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1]!.count;
    return {
      ...s,
      ofPrevious:
        prev === null
          ? null
          : prev > 0
            ? Math.round((s.count / prev) * 100)
            : null,
      ofFirst:
        i === 0 || !stages[0]!.count
          ? null
          : Math.round((s.count / stages[0]!.count) * 100),
    };
  });
}

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
    const row = map.get(key) ?? {
      email: key,
      name,
      chat: false,
      request: false,
    };
    if (!row.name && name) row.name = name;
    map.set(key, row);
    return row;
  };
  for (const c of chats)
    if (c.visitor_email) get(c.visitor_email, c.visitor_name).chat = true;
  for (const r of requests) if (r.email) get(r.email, r.name).request = true;
  const contacts = [...map.values()];
  return {
    chatted: contacts.filter((c) => c.chat).length,
    requested: contacts.filter((c) => c.request).length,
    contacts,
  };
}

export type WeeklyFunnelRow = {
  /** First Riyadh day of the 7-day window (inclusive). */
  from: string;
  /** Last Riyadh day of the window (inclusive). */
  to: string;
  productViewers: number;
  waitlistAnswers: number;
};
export type WeeklyFunnel = {
  weeks: WeeklyFunnelRow[];
  /** Current waitlist size per coming-soon product (active or pending members). */
  waitlists: { id: string; name: string; members: number }[];
};

/** The last `count` 7-day Riyadh windows ending today, newest first. */
export function weekWindows(
  count: number,
  today: string = riyadhDay(),
): { from: string; to: string }[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) => {
    const to = new Date(end - i * 7 * 86_400_000);
    const from = new Date(to.getTime() - 6 * 86_400_000);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  });
}

/** Waitlist answers per 100 product-page viewers, rounded; null when nobody viewed a product. */
export function waitlistRate(
  row: Pick<WeeklyFunnelRow, "productViewers" | "waitlistAnswers">,
) {
  return row.productViewers > 0
    ? Math.round((row.waitlistAnswers / row.productViewers) * 100)
    : null;
}
