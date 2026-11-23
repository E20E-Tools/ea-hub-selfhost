export type VisitorProfile = {
  email: string;
  name: string;
  registeredAt: string | null;
  firstContactAt: string | null;
  requests: number;
  supportRequests: number;
  chats: number;
  verified: boolean;
  /** Most recent chat that is not closed, for manual takeover. */
  openChatId: string | null;
  openChatStatus: string | null;
  openSupport: number;
  lastPage: string;
};

export function summarizeVisitors(
  accounts: { email: string; created_at: string; verified?: boolean }[],
  registrations: { email: string; name: string; created_at: string }[],
  requests: {
    email: string;
    name: string;
    request_type: string;
    created_at: string;
    status?: string;
  }[],
  chats: {
    visitor_email: string;
    visitor_name: string;
    created_at: string;
    id?: string;
    status?: string;
    last_message_at?: string;
    last_page?: string;
    start_page?: string;
  }[],
): VisitorProfile[] {
  const openAt = new Map<string, string>();
  const lastAt = new Map<string, string>();
  const map = new Map<string, VisitorProfile>();
  const get = (email: string, name: string, at: string) => {
    const key = email.trim().toLowerCase();
    if (!key) return null;
    const row = map.get(key) ?? {
      email: key,
      name: "",
      registeredAt: null,
      firstContactAt: null,
      requests: 0,
      supportRequests: 0,
      chats: 0,
      verified: false,
      openChatId: null,
      openChatStatus: null,
      openSupport: 0,
      lastPage: "",
    };
    if (name && !row.name) row.name = name;
    if (!row.firstContactAt || at < row.firstContactAt) row.firstContactAt = at;
    map.set(key, row);
    return row;
  };
  for (const account of accounts) {
    const row = get(account.email, "", account.created_at);
    if (row) {
      row.registeredAt = account.created_at;
      if (account.verified) row.verified = true;
    }
  }
  for (const r of registrations) get(r.email, r.name, r.created_at);
  for (const r of requests) {
    const row = get(r.email, r.name, r.created_at);
    if (row) {
      row.requests++;
      if (r.request_type === "support") {
        row.supportRequests++;
        if (r.status === "new" || r.status === "in_progress") row.openSupport++;
      }
    }
  }
  for (const c of chats) {
    const row = get(c.visitor_email, c.visitor_name, c.created_at);
    if (!row) continue;
    row.chats++;
    const at = c.last_message_at ?? c.created_at;
    const page = c.last_page || c.start_page || "";
    if (page && at >= (lastAt.get(row.email) ?? "")) {
      lastAt.set(row.email, at);
      row.lastPage = page;
    }
    if (c.id && c.status && c.status !== "closed" && at > (openAt.get(row.email) ?? "")) {
      openAt.set(row.email, at);
      row.openChatId = c.id;
      row.openChatStatus = c.status;
    }
  }
  return [...map.values()].sort((a, b) =>
    (b.firstContactAt ?? "").localeCompare(a.firstContactAt ?? ""),
  );
}
