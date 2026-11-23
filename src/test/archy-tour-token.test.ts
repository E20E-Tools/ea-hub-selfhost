// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server-keys.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server-keys.server")>(
    "@/lib/server-keys.server",
  );
  return {
    ...actual,
    deriveSigningSecret: (label: string) =>
      actual.deriveSigningSecret(label, "unit-test-only-secret"),
    deriveSigningSecrets: async (label: string) => [
      await actual.deriveSigningSecret(label, "unit-test-only-secret"),
    ],
  };
});
import {
  issueTourVisitToken,
  verifyTourVisitToken,
  recordTourSupport,
} from "@/lib/archy-tour-visits.server";
import { issueAccessToken } from "@/lib/assistant-gate.server";
describe("tour token isolation", () => {
  it("accepts its own tour token and rejects a forged one", async () => {
    const token = await issueTourVisitToken("visit-id");
    expect(await verifyTourVisitToken(token)).toBe("visit-id");
    expect(await verifyTourVisitToken(token + "x")).toBeNull();
  });
  it("cannot substitute a signed chat token for a tour token", async () => {
    const { token } = await issueAccessToken(
      "chat-only-secret",
      "Visitor",
      "a@example.com",
      Date.now(),
      "other-id",
    );
    expect(await verifyTourVisitToken(token)).toBeNull();
  });
  it("scopes stored support to the signed tour and completed rows only", async () => {
    const chain = { eq: vi.fn(), not: vi.fn(), is: vi.fn() };
    chain.eq.mockReturnValue(chain);
    chain.not.mockReturnValue(chain);
    chain.is.mockResolvedValue({ error: null });
    const db = { from: vi.fn(() => ({ update: vi.fn(() => chain) })) };
    await recordTourSupport(db as never, await issueTourVisitToken("owned-tour"), "receipt-id");
    expect(chain.eq).toHaveBeenCalledWith("id", "owned-tour");
    expect(chain.not).toHaveBeenCalledWith("completed_at", "is", null);
    expect(chain.is).toHaveBeenCalledWith("support_submitted_at", null);
  });
});
