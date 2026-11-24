import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthCallback = (
  event: string,
  session: { user: { id: string } } | null,
) => void;
const auth = vi.hoisted(() => ({
  listeners: [] as AuthCallback[],
  resolveUser: null as null | ((value: unknown) => void),
  lastUser: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      // One deferred lookup drives both the local session hint and the confirmed user.
      getSession: vi.fn(async () => {
        const result = (await new Promise<unknown>((resolve) => {
          auth.resolveUser = resolve;
        })) as { data: { user: unknown } };
        auth.lastUser = result;
        return { data: { session: result.data.user ? {} : null }, error: null };
      }),
      getUser: vi.fn(async () => auth.lastUser),
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        auth.listeners.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

import { requestDraftKey, useRequestDraft } from "@/lib/request-draft";

const emit = (event: string, id: string | null) =>
  act(() =>
    auth.listeners.forEach((listener) =>
      listener(event, id ? { user: { id } } : null),
    ),
  );
const resolveGetUser = (id: string | null) =>
  act(async () => {
    auth.resolveUser?.(
      id
        ? { data: { user: { id } }, error: null }
        : { data: { user: null }, error: { message: "x" } },
    );
    await Promise.resolve();
  });
const stored = (owner: string) =>
  window.sessionStorage.getItem(requestDraftKey("request", owner));
const seed = (
  owner: string,
  values: Record<string, unknown>,
  includePersonal = true,
) =>
  window.sessionStorage.setItem(
    requestDraftKey("request", owner),
    JSON.stringify({ version: 1, includePersonal, values }),
  );

let api: ReturnType<typeof useRequestDraft> & {
  setName: (value: string) => void;
  name: string;
  productId: string;
};
function Form() {
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const restore = useCallback((values: Record<string, unknown>) => {
    if (typeof values["name"] === "string") setName(values["name"]);
    if (typeof values["productId"] === "string")
      setProductId(values["productId"]);
  }, []);
  const reset = () => {
    setName("");
    setProductId("");
  };
  const draft = useRequestDraft(
    "request",
    { type: "new", productId, name },
    restore,
    reset,
  );
  api = { ...draft, setName, name, productId };
  return <output data-testid="name">{name}</output>;
}
const shownName = () => screen.getByTestId("name").textContent;

beforeEach(() => {
  auth.listeners = [];
  auth.resolveUser = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("request drafts follow exactly one identity", () => {
  it("ignores a delayed initial getUser result after a newer auth event", async () => {
    seed("account-b", { type: "new", productId: "radar", name: "Bee" });
    seed("account-a", { type: "new", productId: "landscape", name: "Ay" });
    render(<Form />);
    emit("SIGNED_IN", "account-b");
    expect(shownName()).toBe("Bee");
    await resolveGetUser("account-a");
    expect(shownName()).toBe("Bee");
    expect(stored("account-a")).toContain("Ay");
  });

  it("A→B→A never shows or stores one account's personal fields under another", async () => {
    seed("account-a", { type: "new", productId: "radar", name: "Ay" });
    render(<Form />);
    emit("INITIAL_SESSION", "account-a");
    expect(shownName()).toBe("Ay");
    expect(api.includePersonal).toBe(true);
    emit("SIGNED_IN", "account-b"); // direct switch, no SIGNED_OUT in between
    expect(shownName()).toBe("");
    expect(api.productId).toBe("");
    expect(api.includePersonal).toBe(false);
    expect(stored("account-a")).toBeNull();
    expect(stored("account-b") ?? "").not.toContain("Ay");
    act(() => api.setIncludePersonal(true));
    act(() => api.setName("Bee"));
    expect(stored("account-b")).toContain("Bee");
    emit("SIGNED_IN", "account-a");
    expect(shownName()).toBe("");
    expect(stored("account-b")).toBeNull();
    expect(stored("account-a") ?? "").not.toContain("Bee");
    expect(stored("account-a") ?? "").not.toContain("Ay");
  });

  it("clears personal fields from memory and storage on sign-out", async () => {
    seed("account-a", { type: "new", productId: "radar", name: "Ay" });
    render(<Form />);
    emit("INITIAL_SESSION", "account-a");
    expect(shownName()).toBe("Ay");
    emit("SIGNED_OUT", null);
    expect(shownName()).toBe("");
    expect(stored("account-a")).toBeNull();
    expect(stored("guest") ?? "").not.toContain("Ay");
  });

  it("keeps in-progress edits through a same-owner token refresh", async () => {
    seed("account-a", { type: "new", productId: "radar", name: "Ay" });
    render(<Form />);
    emit("INITIAL_SESSION", "account-a");
    // Storage stops accepting writes (quota/private mode), so the stored copy is now stale.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    act(() => api.setName("Edited"));
    emit("TOKEN_REFRESHED", "account-a");
    expect(shownName()).toBe("Edited");
    expect(api.includePersonal).toBe(true);
  });

  it("does not overwrite fields typed before the owner is known", async () => {
    seed("guest", { type: "new", productId: "radar", name: "Old" });
    render(<Form />);
    act(() => api.setName("Typed"));
    await resolveGetUser(null);
    expect(shownName()).toBe("Typed");
  });

  it("reports blocked storage without crashing or losing typed values", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<Form />);
    await resolveGetUser(null);
    act(() => api.setName("Still here"));
    await waitFor(() => expect(api.status).toBe("unavailable"));
    expect(shownName()).toBe("Still here");
  });

  it("clear() after a confirmed receipt does not recreate the draft until the visitor edits", async () => {
    render(<Form />);
    await resolveGetUser(null);
    act(() => api.setIncludePersonal(true));
    act(() => api.setName("Sent person"));
    expect(stored("guest")).toContain("Sent person");
    act(() => api.clear());
    expect(stored("guest")).toBeNull();
    expect(api.includePersonal).toBe(false);
    act(() => api.setName("Sent person")); // no change re-renders: still suspended
    expect(stored("guest")).toBeNull();
    act(() => api.setName("Next request"));
    expect(stored("guest")).not.toBeNull();
    expect(stored("guest")).not.toContain("Next request"); // personal opt-in was reset
  });
});
