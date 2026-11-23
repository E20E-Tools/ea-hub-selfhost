// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({ results: [] as { data: unknown; error: unknown }[] }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: async () => rpc.results.shift() ?? { data: true, error: null } },
}));

import { checkLimits, consumeLimits } from "@/lib/rate-limit.server";

const rule = { bucket: "chat:burst", subject: "s", limit: 5, windowSeconds: 30 };
beforeEach(() => {
  rpc.results = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

it("treats only an explicit false as quota exhaustion", async () => {
  rpc.results = [{ data: false, error: null }];
  expect(await checkLimits([rule])).toBe("limited");
});

it("allows only an explicit true", async () => {
  rpc.results = [{ data: true, error: null }];
  expect(await checkLimits([rule])).toBe("ok");
});

it.each([null, undefined, "true", 1, {}])(
  "reports unexpected data %j without an error as a store failure, never as abuse",
  async (data) => {
    rpc.results = [{ data, error: null }];
    expect(await checkLimits([rule])).toBe("error");
  },
);

it("reports a store error as a failure and the boolean API fails closed", async () => {
  rpc.results = [{ data: null, error: { code: "x" } }];
  expect(await checkLimits([rule])).toBe("error");
  rpc.results = [{ data: null, error: null }];
  expect(await consumeLimits([rule])).toBe(false);
});
