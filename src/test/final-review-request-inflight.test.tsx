import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event: string, session: { user: { id: string } } | null) => void;
const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  resolveSend: null as null | ((value: unknown) => void),
  sent: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: "no session" } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (callback: Listener) => {
        h.listeners.push(callback);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
vi.mock("@/lib/requests.functions", () => ({
  submitRequest: () => {
    h.sent += 1;
    return new Promise((resolve) => {
      h.resolveSend = resolve;
    });
  },
}));
vi.mock("@/lib/current-visitor-access", () => ({
  currentVisitorAccess: async () => "",
  currentAuthUser: async () => ({ kind: "guest" }),
}));
vi.mock("@/lib/catalog.functions", async () => {
  const { fallbackCatalog } = await import("@/lib/catalog");
  return {
    catalogQueryOptions: {
      queryKey: ["catalog"],
      queryFn: async () => fallbackCatalog,
      staleTime: 60_000,
    },
  };
});
vi.mock("@/lib/contact.functions", () => ({
  DEFAULT_CONTACT_EMAIL: "ea@e20e.tools",
  getPublicContactEmail: vi.fn(async () => "ea@e20e.tools"),
}));
vi.mock("@/components/visit-tracker", () => ({ VisitTracker: () => null }));
vi.mock("@/components/assistant-chat", () => ({ AssistantChat: () => null }));

import { routeTree } from "@/routeTree.gen";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("request form sending across an identity change", () => {
  it("does not show the previous owner's receipt when sign-out happens mid-send", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      history: createMemoryHistory({ initialEntries: ["/request?type=general"] }),
    });
    await router.load();
    const { container } = render(<RouterProvider router={router} />);
    const name = (await waitFor(() => {
      const field = container.querySelector("#request-name");
      if (!field) throw new Error("form not ready");
      return field;
    })) as HTMLInputElement;
    // Let the draft owner resolve (first identity) before typing.
    await waitFor(() => expect(h.listeners.length).toBeGreaterThan(0));
    await act(async () => {
      h.listeners.forEach((listener) => listener("INITIAL_SESSION", { user: { id: "account-a" } }));
    });
    fireEvent.change(name, { target: { value: "Account A" } });
    fireEvent.change(container.querySelector("#request-email")!, {
      target: { value: "a@example.com" },
    });
    fireEvent.change(container.querySelector("#request-need")!, {
      target: { value: "Please contact me about mapping our application landscape." },
    });
    const form = () => container.querySelector("form.request-form") as HTMLFormElement;
    fireEvent.submit(form()); // review step
    fireEvent.submit(form()); // send
    await waitFor(() => expect(h.sent).toBe(1));
    window.sessionStorage.setItem(
      "e20e-request-prefill",
      JSON.stringify({ name: "Account A", email: "a@example.com", access: "pass-a" }),
    );
    await act(async () => {
      h.listeners.forEach((listener) => listener("SIGNED_OUT", null));
    });
    // The previous owner's chat prefill (including its pass) is discarded on the change.
    expect(window.sessionStorage.getItem("e20e-request-prefill")).toBeNull();
    await act(async () => {
      h.resolveSend?.({
        ok: true,
        id: "aaaaaaaa-0000-4000-8000-00000000000a",
        createdAt: "2026-11-14T09:00:00Z",
        tracking: "account",
      });
      await Promise.resolve();
    });
    expect(screen.queryByText("aaaaaaaa-0000-4000-8000-00000000000a")).toBeNull();
    expect((container.querySelector("#request-name") as HTMLInputElement | null)?.value ?? "").toBe(
      "",
    );
  }, 20000);
});
