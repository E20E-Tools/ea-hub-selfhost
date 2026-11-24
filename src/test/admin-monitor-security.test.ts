// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: null as null | { userId: string; supabase: unknown },
  role: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      handler: (handler: (value: unknown) => unknown) => async () => {
        if (!mocks.context) throw new Error("Unauthorized");
        return handler({ context: mocks.context });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from },
}));
import { getAdminAiUsage } from "@/lib/admin-monitor.functions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context = { userId: "owner", supabase: { rpc: mocks.role } };
});
it("rejects anonymous usage reads", async () => {
  mocks.context = null;
  await expect(getAdminAiUsage()).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
it("rejects non-admins before privileged access", async () => {
  mocks.role.mockResolvedValue({ data: false });
  await expect(getAdminAiUsage()).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
it("fails closed on role errors", async () => {
  mocks.role.mockResolvedValue({ data: true, error: {} });
  await expect(getAdminAiUsage()).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
it("counts accepted requests without exposing visitor subjects", async () => {
  mocks.role.mockResolvedValue({ data: true, error: null });
  const gte = vi
    .fn()
    .mockResolvedValueOnce({ count: 7, error: null })
    .mockResolvedValueOnce({ count: 3, error: null })
    .mockResolvedValueOnce({ count: 2, error: null });
  const eq = vi.fn().mockReturnValue({ gte });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.from.mockReturnValue({ select });
  const value = await getAdminAiUsage();
  expect(value).toMatchObject({
    chat: 7,
    recommendations: 3,
    bans: 2,
    chatLimit: 500,
    recommendationLimit: 500,
  });
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(eq).toHaveBeenCalledWith("bucket", "chat:global-day");
  expect(eq).toHaveBeenCalledWith("bucket", "ai:global-day");
  expect(eq).toHaveBeenCalledWith("bucket", "chat:ban");
});
