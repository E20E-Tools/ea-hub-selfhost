// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: null as null | { userId: string; claims: unknown; supabase: unknown },
  role: vi.fn(),
  from: vi.fn(),
  users: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = {
      middleware: () => b,
      handler: (fn: (args: unknown) => unknown) => async () => {
        if (!mocks.context) throw new Error("Unauthorized");
        return fn({ context: mocks.context });
      },
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, auth: { admin: { listUsers: mocks.users } } },
}));
import { listVisitorProfiles } from "@/lib/visitors.functions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context = { userId: "caller", claims: {}, supabase: { rpc: mocks.role, from: mocks.from } };
  mocks.role.mockResolvedValue({ data: true, error: null });
  mocks.users.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.from.mockReturnValue({
    select: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }),
  });
});
describe("visitor details authorization", () => {
  it("rejects signed-out callers before any private read", async () => {
    mocks.context = null;
    await expect(listVisitorProfiles()).rejects.toThrow("Unauthorized");
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("rejects ordinary visitors before account and registration reads", async () => {
    mocks.role.mockResolvedValue({ data: false, error: null });
    await expect(listVisitorProfiles()).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("fails closed when the admin role lookup fails", async () => {
    mocks.role.mockResolvedValue({ data: true, error: { message: "offline" } });
    await expect(listVisitorProfiles()).rejects.toThrow();
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("allows a verified admin to read the joined records", async () => {
    await expect(listVisitorProfiles()).resolves.toEqual([]);
    expect(mocks.users).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
  });
});
