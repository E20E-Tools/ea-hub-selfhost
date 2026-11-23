// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), verify: vi.fn(), admin: vi.fn(), context: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const b = {
      middleware: () => b,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => (args?: { data: unknown }) =>
        fn({ data: validate(args?.data), context: mocks.context }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/admin-guard.server", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/archy-tour-visits.server", () => ({
  verifyTourVisitToken: mocks.verify,
  tourVisitorIdentity: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import { listTourVisits, updateTourVisit } from "@/lib/archy-tour-visits.functions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context = {};
});
describe("tour visitor authorization", () => {
  it("rejects a forged tour token before reading records", async () => {
    mocks.verify.mockResolvedValue(null);
    expect(await updateTourVisit({ data: { token: "forged", action: "chat" } })).toEqual({
      ok: false,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects a non-admin before reading visitor outcomes", async () => {
    mocks.admin.mockRejectedValue(new Error("Forbidden"));
    await expect(listTourVisits()).rejects.toThrow("Forbidden");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
