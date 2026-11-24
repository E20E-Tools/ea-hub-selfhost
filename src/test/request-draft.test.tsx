import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing" },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { RequestDraftControls } from "@/components/request-draft-controls";
import {
  parseRequestDraft,
  requestDraftKey,
  sanitizeRequestDraft,
  useRequestDraft,
} from "@/lib/request-draft";

const values = {
  type: "support",
  productId: "radar",
  urgency: "urgent",
  name: "Private Name",
  email: "private@example.com",
  phone: "+966500000000",
  need: "Sensitive request details here",
  access: "signed-token",
  files: ["not-allowed"],
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("privacy-scoped request drafts", () => {
  it("keeps guest drafts available when no authenticated session exists", async () => {
    const value = {
      type: "general",
      productId: "radar",
      urgency: "",
      name: "Private Name",
    };
    const { result } = renderHook(() =>
      useRequestDraft("request", value, () => {}),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBe("saved");
    const stored = window.sessionStorage.getItem(
      requestDraftKey("request", "guest"),
    );
    expect(stored).toContain("radar");
    expect(stored).not.toContain("Private Name");
  });
  it("keeps only non-personal choices by default", () => {
    const draft = sanitizeRequestDraft("request", values, false);
    expect(draft.values).toEqual({
      type: "support",
      productId: "radar",
      urgency: "urgent",
    });
    expect(JSON.stringify(draft)).not.toContain("Private");
    expect(JSON.stringify(draft)).not.toContain("signed-token");
  });
  it("requires explicit opt-in for personal content and never stores tokens or files", () => {
    const draft = sanitizeRequestDraft("request", values, true);
    expect(draft.values["name"]).toBe("Private Name");
    expect(draft.values).not.toHaveProperty("access");
    expect(draft.values).not.toHaveProperty("files");
  });
  it("separates guest and account sessions and drops malformed values", () => {
    expect(requestDraftKey("request", "guest")).not.toBe(
      requestDraftKey("request", "account-a"),
    );
    expect(requestDraftKey("service", "account-a")).not.toBe(
      requestDraftKey("service", "account-b"),
    );
    expect(parseRequestDraft("bad")).toBeNull();
    expect(
      parseRequestDraft(
        JSON.stringify({ version: 1, includePersonal: true, values }),
      )?.values,
    ).not.toHaveProperty("access");
  });
  it("disables the opt-in checkbox until the draft owner is known", () => {
    const props = {
      includePersonal: false,
      onPersonalChange: () => {},
      onClear: () => {},
    };
    const { rerender } = render(
      <RequestDraftControls status="loading" {...props} />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    rerender(<RequestDraftControls status="saved" {...props} />);
    expect(screen.getByRole("checkbox")).toBeEnabled();
  });
});
