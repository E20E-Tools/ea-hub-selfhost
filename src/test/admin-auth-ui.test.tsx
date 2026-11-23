import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const api = vi.hoisted(() => ({
  access: vi.fn(),
  signIn: vi.fn(),
  reset: vi.fn(),
  signOut: vi.fn(),
  dashboard: vi.fn(),
}));
// Server-function modules load through the admin route, so the mock has to answer
// the whole createServerFn/createMiddleware chain, not just useServerFn.
vi.mock("@tanstack/react-start", () => {
  const chain = (): Record<string, unknown> => {
    const step: Record<string, unknown> = {};
    for (const key of [
      "middleware",
      "inputValidator",
      "handler",
      "server",
      "all",
    ])
      step[key] = () => step;
    return step;
  };
  return {
    useServerFn: (fn: unknown) => fn,
    createMiddleware: () => chain(),
    createServerFn: () => chain(),
  };
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
  useSearch: () => ({}),
  useNavigate: () => () => undefined,
  useBlocker: () => undefined,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: api.signOut,
      signInWithPassword: api.signIn,
      resetPasswordForEmail: api.reset,
    },
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: null }) }),
    },
  },
}));
vi.mock("@/components/admin/live-chat", () => ({
  useLiveChatAlerts: () => 0,
  LiveChatSection: () => null,
}));
vi.mock("@/components/admin/settings", () => ({ SettingsSection: () => null }));
vi.mock("@/lib/admin.functions", () => ({
  getAdminAccess: api.access,
  getAdminDashboard: api.dashboard,
}));
vi.mock("@/lib/admin-monitor.functions", () => ({
  getAdminAiUsage: async () => ({ chat: 1, chatLimit: 10 }),
}));
vi.mock("@/lib/catalog.functions", () => ({
  catalogQueryOptions: {
    queryKey: ["catalog"],
    queryFn: async () => fallbackCatalog,
  },
}));
import { fallbackCatalog } from "@/lib/catalog";
import { Route } from "@/routes/admin";

function openAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["catalog"], fallbackCatalog);
  const Admin = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={client}>
      <Admin />
    </QueryClientProvider>,
  );
}

describe("Admin access with mocked sessions only", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.signOut.mockResolvedValue({ error: null });
    api.reset.mockResolvedValue({ error: null });
    api.dashboard.mockResolvedValue({
      newRequests: 2,
      newByType: { new: 2, feature: 0, support: 0, general: 0, service: 0 },
      urgentSupport: 0,
      newOffers: 1,
      latestRequests: [],
      latestOffers: [],
      latestActivity: [],
    });
  });
  afterEach(cleanup);

  it("keeps anonymous visitors on the sign-in card", async () => {
    api.access.mockRejectedValue(new Error("Unauthorized"));
    openAdmin();
    expect(await screen.findByLabelText("Password")).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Admin sections" }),
    ).not.toBeInTheDocument();
  });

  it("locks sign-in for a minute after five failed attempts", async () => {
    api.access.mockRejectedValue(new Error("Unauthorized"));
    api.signIn.mockResolvedValue({ error: { message: "invalid" } });
    openAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-pass" },
    });
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() => expect(api.signIn).toHaveBeenCalledTimes(i + 1));
    }
    expect(
      await screen.findByText(
        "Too many attempts. Wait a minute and try again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("shows forgot-password confirmation as a neutral notice, not an error", async () => {
    api.access.mockRejectedValue(new Error("Unauthorized"));
    openAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("a link to set a new password");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets an admin retry a rejected recovery request without showing a sent notice", async () => {
    api.access.mockRejectedValue(new Error("Unauthorized"));
    api.reset.mockResolvedValueOnce({ error: { message: "unreachable" } });
    openAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    const recover = screen.getByRole("button", { name: "Forgot password?" });
    fireEvent.click(recover);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "recovery request failed",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(recover);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "a link to set a new password",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("unlocks the sign-in form after a transport exception", async () => {
    api.access.mockRejectedValue(new Error("Unauthorized"));
    api.signIn.mockRejectedValueOnce(new TypeError("network unavailable"));
    openAdmin();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "test-password" },
    });
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "account service",
    );
    expect(submit).toBeEnabled();
  });
  it("denies ordinary users", async () => {
    api.access.mockResolvedValue({
      isAdmin: false,
      email: "member@example.com",
    });
    openAdmin();
    await screen.findByRole("heading", { name: "This account isn't an admin" });
    expect(
      screen.queryByRole("navigation", { name: "Admin sections" }),
    ).not.toBeInTheDocument();
  });

  it("opens the console for admins with the merged customer workspace", async () => {
    api.access.mockResolvedValue({ isAdmin: true, email: "owner@example.com" });
    openAdmin();
    const nav = await screen.findByRole("navigation", {
      name: "Admin sections",
    });
    for (const name of [
      "Dashboard",
      "Customer workspace",
      "Content",
      "Settings",
      "Security",
    ])
      expect(nav).toHaveTextContent(name);
    // Inbox, live chat and feedback are tabs of the customer workspace, not separate entries.
    expect(nav).not.toHaveTextContent("Live chat");
  });

  it("removes admin controls on sign-out", async () => {
    api.access.mockResolvedValue({ isAdmin: true, email: "owner@example.com" });
    openAdmin();
    await screen.findByRole("navigation", { name: "Admin sections" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText("Password")).toBeVisible();
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });
});
