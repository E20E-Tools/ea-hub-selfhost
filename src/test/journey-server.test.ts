// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  headers: new Headers(),
  limit: "ok",
  admin: true,
  record: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler:
        (fn: (args: unknown) => unknown) => async (args?: { data: unknown }) =>
          fn({
            data: validate(args?.data),
            context: { userId: "admin", supabase: { from: state.query } },
          }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: state.headers }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@/lib/admin-guard.server", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("Forbidden");
  },
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "203.0.113.1",
  checkLimits: async () => state.limit,
}));
vi.mock("@/lib/journey.server", () => ({ recordJourney: state.record }));
import {
  getJourneyOverview,
  recordJourneyEvent,
} from "@/lib/journey.functions";
const input = {
  event: "chooser_completed",
  language: "en",
  eventKey: "725e1a8f-01cb-4cdd-a274-72a373480b31",
  rating: null,
};
beforeEach(() => {
  state.headers = new Headers();
  state.limit = "ok";
  state.admin = true;
  state.record.mockReset().mockResolvedValue(true);
  state.query.mockReset();
});
it("records only allowlisted bounded visitor actions", async () => {
  await expect(recordJourneyEvent({ data: input })).resolves.toEqual({
    ok: true,
  });
  expect(state.record).toHaveBeenCalledWith(
    "chooser_completed",
    "en",
    input.eventKey,
    undefined,
  );
  await expect(
    recordJourneyEvent({ data: { ...input, event: "request_completed" } }),
  ).rejects.toThrow();
  await expect(
    recordJourneyEvent({ data: { ...input, eventKey: "not-a-uuid" } }),
  ).rejects.toThrow();
});
it("fails closed cross-site, on limits and store errors without claiming success", async () => {
  state.headers = new Headers({ "sec-fetch-site": "cross-site" });
  expect((await recordJourneyEvent({ data: input })).ok).toBe(false);
  state.headers = new Headers();
  state.limit = "limited";
  expect((await recordJourneyEvent({ data: input })).ok).toBe(false);
  state.limit = "ok";
  state.record.mockResolvedValue(false);
  expect((await recordJourneyEvent({ data: input })).ok).toBe(false);
});
it("refuses to count when the browser sends GPC or DNT", async () => {
  state.headers = new Headers({ "sec-gpc": "1" });
  expect((await recordJourneyEvent({ data: input })).ok).toBe(false);
  state.headers = new Headers({ dnt: "1" });
  expect((await recordJourneyEvent({ data: input })).ok).toBe(false);
  expect(state.record).not.toHaveBeenCalled();
});
it("requires admin before reading aggregate rows", async () => {
  state.admin = false;
  await expect(getJourneyOverview()).rejects.toThrow("Forbidden");
  expect(state.query).not.toHaveBeenCalled();
});
