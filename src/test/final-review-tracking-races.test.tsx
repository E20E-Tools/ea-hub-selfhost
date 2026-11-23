import type React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: string) => void;
const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  access: [] as { resolve: (token: string, accountId?: string) => void }[],
  journey: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: Listener) => {
        h.listeners.push(callback);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
vi.mock("@/lib/current-visitor-access", () => ({
  currentViewer: () =>
    new Promise<{ token: string; accountId: string }>((resolve) => {
      h.access.push({ resolve: (token, accountId = "") => resolve({ token, accountId }) });
    }),
}));
vi.mock("@/lib/tracking.functions", () => ({
  getMyJourney: h.journey,
  getMyChatHistory: vi.fn(),
}));

import { Route } from "@/routes/my-requests";
import { ASSISTANT_SESSION_EVENT } from "@/lib/assistant-events";

const receiptA = "aaaaaaaa-0000-4000-8000-00000000000a";
const journeyFor = (token: string) => ({
  status: "ok",
  owner: "guest",
  requests: [
    {
      id: token === "pass-a" ? receiptA : "bbbbbbbb-0000-4000-8000-00000000000b",
      request_type: "general",
      need: `need for ${token}`,
      product_id: null,
      created_at: "2026-11-14T09:00:00Z",
      status: "new",
      status_updated_at: null,
      attachmentCount: 0,
      chatId: "",
    },
  ],
  chats: [],
  replies: [],
  requestsHasMore: false,
  chatsHasMore: false,
  repliesHasMore: false,
});

async function mount() {
  const Page = Route.options.component as () => React.ReactElement;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(h.access.length).toBeGreaterThan(0));
}
const emit = (event: string) => act(() => h.listeners.forEach((listener) => listener(event)));
const resolveAccess = (index: number, token: string, accountId = "") =>
  act(async () => {
    h.access[index]?.resolve(token, accountId);
    await Promise.resolve();
  });

beforeEach(() => {
  h.listeners = [];
  h.access = [];
  h.journey
    .mockReset()
    .mockImplementation(async ({ data }: { data: { access: string } }) =>
      data.access ? journeyFor(data.access) : { status: "unauthorized" },
    );
});
afterEach(() => cleanup());

describe("My requests never paints a previous owner's data", () => {
  it("ignores a slow earlier pass read that resolves after sign-out", async () => {
    await mount();
    emit("SIGNED_OUT");
    await resolveAccess(1, "");
    await resolveAccess(0, "pass-a");
    expect(await screen.findByRole("button", { name: "Verify with Archy" })).toBeInTheDocument();
    expect(h.journey).toHaveBeenCalledWith({ data: { access: "" } });
    expect(h.journey).not.toHaveBeenCalledWith({ data: { access: "pass-a" } });
    expect(screen.queryByText(receiptA)).toBeNull();
  });

  it("hides the previous owner's receipts as soon as the identity changes", async () => {
    await mount();
    await resolveAccess(0, "pass-a");
    expect(await screen.findByText(receiptA)).toBeInTheDocument();
    emit("SIGNED_OUT");
    // The next pass read is still pending, yet the previous receipts are already gone.
    expect(screen.queryByText(receiptA)).toBeNull();
  });

  it("re-reads the pass after Archy saves one, so the list appears without reloading", async () => {
    await mount();
    await resolveAccess(0, "");
    expect(await screen.findByRole("button", { name: "Verify with Archy" })).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(ASSISTANT_SESSION_EVENT)));
    await resolveAccess(1, "pass-b");
    expect(await screen.findByText("need for pass-b")).toBeInTheDocument();
  });

  it("lists a signed-in account's requests even without an Archy pass", async () => {
    await mount();
    h.journey.mockResolvedValueOnce(journeyFor("account"));
    await resolveAccess(0, "", "account-1");
    expect(await screen.findByText("need for account")).toBeInTheDocument();
    expect(h.journey).toHaveBeenCalledWith({ data: { access: "" } });
  });

  it("can recover a guest receipt using a server-verified contact cookie alone", async () => {
    h.journey.mockResolvedValueOnce(journeyFor("cookie-owner"));
    await mount();
    await resolveAccess(0, "");
    expect(await screen.findByText("need for cookie-owner")).toBeInTheDocument();
  });

  it("hides rows at once when the Archy guest pass changes", async () => {
    await mount();
    await resolveAccess(0, "pass-a");
    expect(await screen.findByText(receiptA)).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(ASSISTANT_SESSION_EVENT)));
    expect(screen.queryByText(receiptA)).toBeNull();
  });
});
