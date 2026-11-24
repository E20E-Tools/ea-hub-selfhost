import { renderHook } from "@testing-library/react";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      // A stored sign-in exists locally, but the server reports it revoked (session_not_found).
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "x" } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: new AuthSessionMissingError(),
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { requestDraftKey, useRequestDraft } from "@/lib/request-draft";

afterEach(() => window.sessionStorage.clear());

describe("an unconfirmed stored sign-in", () => {
  it("never restores the guest draft into the form", async () => {
    window.sessionStorage.setItem(
      requestDraftKey("request", "guest"),
      JSON.stringify({
        version: 1,
        kind: "request",
        includePersonal: false,
        values: { productId: "radar" },
      }),
    );
    const restore = vi.fn();
    const { result } = renderHook(() =>
      useRequestDraft("request", { productId: "" }, restore),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(restore).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });
});
