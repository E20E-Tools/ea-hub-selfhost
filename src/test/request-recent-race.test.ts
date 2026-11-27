// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  /** id of the earliest request for this email in the window, as the database sees it. */
  earliest: "",
  rows: new Set<string>(),
  deleted: [] as string[],
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
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data?: unknown }) =>
          handler({ data: validate(args?.data) }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "203.0.113.1",
  consumeLimits: async () => true,
  noteBudgetUsage: async () => undefined,
}));
vi.mock("@/lib/telemetry.server", () => ({ recordTelemetry: async () => {} }));
vi.mock("@/lib/recommend.server", () => ({ liveCatalog: async () => [] }));
vi.mock("@/lib/contact-notify.server", () => ({
  notifyContactSubmission: async () => {},
}));
vi.mock("@/lib/journey.server", () => ({ recordJourney: async () => true }));
vi.mock("@/lib/contact-owner.server", () => ({ contactOwner: () => null }));
vi.mock("@/integrations/supabase/client.server", () => {
  const table = () => {
    let ordered = false;
    let idFilter = "";
    const chain = {
      select: (_columns: string, options?: { head?: boolean }) => {
        if (options?.head) {
          // The pre-insert count: the concurrent request is not committed yet.
          return {
            eq: () => ({ gte: async () => ({ count: 0, error: null }) }),
          };
        }
        return chain;
      },
      eq: (column: string, value: string) => {
        if (column === "id") idFilter = value;
        return chain;
      },
      gte: () => chain,
      order: () => {
        ordered = true;
        return chain;
      },
      limit: () => chain,
      maybeSingle: async () =>
        ordered
          ? { data: db.earliest ? { id: db.earliest } : null, error: null }
          : { data: null, error: null },
      single: async () => ({
        data: { id: idFilter, created_at: "2026-11-27T00:00:00Z" },
        error: null,
      }),
      insert: async (row: { id: string }) => {
        db.rows.add(row.id);
        return { error: null };
      },
      delete: () => ({
        eq: async (_column: string, value: string) => {
          db.deleted.push(value);
          db.rows.delete(value);
          return { error: null };
        },
      }),
    };
    return chain;
  };
  return {
    supabaseAdmin: {
      from: table,
      storage: { from: () => ({ remove: async () => ({}) }) },
    },
  };
});

import { submitRequest } from "@/lib/requests.functions";

const mine = "725e1a8f-01cb-4cdd-a274-72a373480b31";
function form() {
  const data = new FormData();
  Object.entries({
    requestId: mine,
    name: "Khaled",
    email: "ea@example.com",
    need: "We need a way to map current technologies across the organisation.",
    phone: "+966500000000",
    website: "",
    type: "general",
  }).forEach(([k, v]) => data.set(k, v));
  return data;
}

beforeEach(() => {
  db.earliest = "";
  db.rows = new Set();
  db.deleted = [];
});

it("keeps the request when it is the earliest one in the window", async () => {
  db.earliest = mine;
  expect(await submitRequest({ data: form() })).toMatchObject({ ok: true });
  expect(db.deleted).toEqual([]);
  expect(db.rows.has(mine)).toBe(true);
});

it("removes a concurrent later duplicate and answers 'recent'", async () => {
  db.earliest = "9f3c1a2b-0000-4000-8000-000000000001";
  expect(await submitRequest({ data: form() })).toEqual({
    ok: false,
    message: "rqErrRecent",
  });
  expect(db.deleted).toEqual([mine]);
  expect(db.rows.has(mine)).toBe(false);
});
