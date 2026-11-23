// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  identity: null as null | { kind: "guest" | "account"; id: string; email: string },
  calls: [] as { table: string; column?: string; id?: string }[],
  reject: false,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const b = {
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => async (args?: { data: unknown }) =>
        fn({ data: validate(args?.data) }),
    };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers() }) }));
vi.mock("@/lib/request-identity.server", () => ({
  resolveRequestIdentity: async () => {
    if (state.reject) throw new Error("invalid");
    return state.identity;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const call: { table: string; column?: string; id?: string } = { table };
      state.calls.push(call);
      const chain = {
        select: () => chain,
        eq: (column: string, id: string) => {
          call.column = column;
          call.id = id;
          return chain;
        },
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        in: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import { getMyJourney } from "@/lib/tracking.functions";
beforeEach(() => {
  state.identity = null;
  state.reject = false;
  state.calls = [];
});
it("does not query any store without a verified identity", async () => {
  expect((await getMyJourney({ data: { access: "" } })).status).toBe("unauthorized");
  state.reject = true;
  expect((await getMyJourney({ data: { access: "bad" } })).status).toBe("unauthorized");
  expect(state.calls).toHaveLength(0);
});
it("scopes guests by server-minted visitor ID, never typed email", async () => {
  state.identity = { kind: "guest", id: "guest-uuid", email: "person@example.com" };
  expect((await getMyJourney({ data: { access: "signed" } })).status).toBe("ok");
  expect(state.calls.find((call) => call.table === "request_identities")).toMatchObject({
    column: "visitor_id",
    id: "guest-uuid",
  });
  expect(state.calls.find((call) => call.table === "live_chats")).toMatchObject({
    column: "visitor_id",
    id: "guest-uuid",
  });
  expect(state.calls.some((call) => call.column === "email")).toBe(false);
});
it("uses the verified account subject for account tracking", async () => {
  state.identity = { kind: "account", id: "account-uuid", email: "account@example.com" };
  await getMyJourney({ data: { access: "" } });
  expect(state.calls.find((call) => call.table === "request_identities")).toMatchObject({
    column: "account_id",
    id: "account-uuid",
  });
});
