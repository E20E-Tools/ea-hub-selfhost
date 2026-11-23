// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const RID = "725e1a8f-01cb-4cdd-a274-72a373480b31";
const m = vi.hoisted(() => ({
  headers: new Headers(),
  existing: null as null | { id: string; created_at: string; email?: string },
  insertError: null as null | { code: string },
  link: null as null | { visitor_id: string | null; account_id: string | null },
  inserts: [] as string[],
  uploads: 0,
  notify: vi.fn(),
  journey: vi.fn(),
  verifyVisitor: vi.fn(),
  getUser: vi.fn(),
  recent: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: (value: unknown) => unknown) => {
        validate = validator;
        return builder;
      },
      handler: (handler: (args: unknown) => unknown) => async (args?: { data?: unknown }) =>
        handler({ data: validate(args?.data) }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: m.headers }) }));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "203.0.113.9",
  consumeLimits: async () => true,
  noteBudgetUsage: async () => undefined,
}));
vi.mock("@/lib/telemetry.server", () => ({ recordTelemetry: async () => undefined }));
vi.mock("@/lib/recommend.server", () => ({ liveCatalog: async () => [{ id: "itfm" }] }));
vi.mock("@/lib/contact-notify.server", () => ({ notifyContactSubmission: m.notify }));
vi.mock("@/lib/journey.server", () => ({ recordJourney: m.journey }));
vi.mock("@/lib/live-chat.server", () => ({
  verifyVisitor: m.verifyVisitor,
  openChatFor: async () => ({ id: "f8bcd11c-a841-40d4-a501-13b8f28d74ca", status: "ai" }),
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const table = (name: string) => {
    let byId = false;
    const chain = {
      select: () => chain,
      eq: (column: string) => {
        if (column === "id" || column === "request_id") byId = true;
        return chain;
      },
      gte: () => Promise.resolve({ count: m.recent, error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: name === "request_identities" ? m.link : byId ? m.existing : null,
          error: null,
        }),
      single: () =>
        Promise.resolve({ data: { id: RID, created_at: "2026-11-14T10:00:00Z" }, error: null }),
      insert: () => {
        m.inserts.push(name);
        if (name === "suggestion_requests" && m.insertError) {
          const error = m.insertError;
          m.existing = { id: RID, created_at: "2026-11-14T09:00:00Z" };
          return Promise.resolve({ error });
        }
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  };
  return {
    supabaseAdmin: {
      from: table,
      auth: { getUser: m.getUser },
      storage: {
        from: () => ({
          upload: async () => {
            m.uploads += 1;
            return { error: null };
          },
          remove: async () => ({}),
        }),
      },
    },
  };
});

import { submitRequest } from "@/lib/requests.functions";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    requestId: RID,
    type: "general",
    name: "Khaled",
    email: "ea@example.com",
    need: "We need a way to map current technologies across the organisation.",
    phone: "+966500000000",
    website: "",
    ...values,
  }).forEach(([k, v]) => data.set(k, v));
  return data;
}

beforeEach(() => {
  m.headers = new Headers();
  m.existing = null;
  m.link = null;
  m.inserts = [];
  m.uploads = 0;
  m.notify.mockReset();
  m.journey.mockReset().mockResolvedValue(true);
  m.verifyVisitor.mockReset().mockResolvedValue(null);
  m.getUser.mockReset();
  m.recent = 0;
  m.insertError = null;
});

describe("request resend after a lost response", () => {
  const stored = { id: RID, created_at: "2026-11-14T09:00:00Z", email: "ea@example.com" };
  const guestA = { id: "guest-a", email: "ea@example.com", name: "K" };

  it("refuses a resend with only the request number and email (no proven owner)", async () => {
    m.existing = stored;
    expect(await submitRequest({ data: form() })).toEqual({ ok: false, message: "rqErrReceipt" });
    expect(m.inserts).toEqual([]);
  });

  it("returns the stored receipt to the signed guest linked to it, without saving twice", async () => {
    m.verifyVisitor.mockResolvedValue(guestA);
    m.existing = stored;
    m.link = { visitor_id: "guest-a", account_id: null };
    expect(await submitRequest({ data: form({ visitorAccess: "pass-a" }) })).toEqual({
      ok: true,
      id: RID,
      createdAt: "2026-11-14T09:00:00Z",
      tracking: "guest",
    });
    expect(m.inserts).toEqual([]);
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.journey).not.toHaveBeenCalled();
  });

  it("never returns another owner's receipt", async () => {
    m.verifyVisitor.mockResolvedValue(guestA);
    m.existing = stored;
    m.link = { visitor_id: "guest-b", account_id: null };
    expect(await submitRequest({ data: form({ visitorAccess: "pass-a" }) })).toEqual({
      ok: false,
      message: "rqErrReceipt",
    });
  });

  it("answers a concurrent duplicate insert with the same ownership rule", async () => {
    m.insertError = { code: "23505" };
    expect(await submitRequest({ data: form() })).toEqual({ ok: false, message: "rqErrReceipt" });
    expect(m.notify).not.toHaveBeenCalled();
  });
});

describe("expired or unverifiable guest chat pass", () => {
  it("still saves an ordinary request, untracked", async () => {
    const result = await submitRequest({ data: form({ visitorAccess: "expired-pass" }) });
    expect(result).toMatchObject({ ok: true, tracking: "none" });
    expect(m.inserts).toEqual(["suggestion_requests"]);
  });

  it("still rejects a chat-linked request", async () => {
    const result = await submitRequest({
      data: form({ visitorAccess: "expired-pass", fromChat: "1", chatAccess: "expired-pass" }),
    });
    expect(result).toEqual({ ok: false, message: "rqErrRejected" });
    expect(m.inserts).toEqual([]);
  });

  it("still rejects an invalid account session", async () => {
    m.headers = new Headers({ authorization: "Bearer not-valid" });
    m.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    const result = await submitRequest({ data: form({ visitorAccess: "expired-pass" }) });
    expect(result).toEqual({ ok: false, message: "rqErrRejected" });
    expect(m.inserts).toEqual([]);
  });
});

describe("resend and optional follow-up steps", () => {
  it("returns the owner's stored receipt even though the email sent a request moments ago", async () => {
    m.recent = 1;
    m.verifyVisitor.mockResolvedValue({ id: "guest-a", email: "ea@example.com", name: "K" });
    m.existing = { id: RID, created_at: "2026-11-14T09:00:00Z" };
    m.link = { visitor_id: "guest-a", account_id: null };
    expect(await submitRequest({ data: form({ visitorAccess: "pass-a" }) })).toMatchObject({
      ok: true,
      id: RID,
    });
  });

  it("still refuses a new request number from the same email within two minutes", async () => {
    m.recent = 1;
    expect(await submitRequest({ data: form() })).toEqual({ ok: false, message: "rqErrRecent" });
  });

  it("reports a committed request as saved when the alert email step fails", async () => {
    m.notify.mockRejectedValue(new Error("mail down"));
    expect(await submitRequest({ data: form() })).toMatchObject({ ok: true, id: RID });
  });

  it("reports a committed request as saved when the visit count step fails", async () => {
    m.journey.mockRejectedValue(new Error("db down"));
    expect(await submitRequest({ data: form() })).toMatchObject({ ok: true, id: RID });
  });
});
