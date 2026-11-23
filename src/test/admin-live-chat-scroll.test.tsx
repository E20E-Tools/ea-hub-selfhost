import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LiveChatSection } from "@/components/admin/live-chat";

const api = vi.hoisted(() => ({
  readMessages: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: api.readMessages,
  };
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: () => query,
      channel: () => channel,
      removeChannel: api.removeChannel,
    },
  };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/live-chat.functions", () => ({
  adminChatVisitorSupport: async () => [],
  adminCloseLiveChat: vi.fn(),
  adminSendLiveMessage: vi.fn(),
}));

it("keeps a chat open when scrolling returns a promise and cleans up after leaving the thread", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const sentAt = "2026-11-19T12:00:00Z";
  client.setQueryData(
    ["admin", "live-chats"],
    [
      {
        id: "thread-1",
        visitor_name: "Sample visitor",
        visitor_email: "visitor@example.test",
        status: "active",
        created_at: sentAt,
        last_message_at: sentAt,
      },
    ],
  );
  api.readMessages.mockResolvedValue({
    data: [
      {
        id: "message-1",
        sender: "visitor",
        body: "Can we discuss the roadmap?",
        created_at: sentAt,
      },
    ],
    error: null,
  });

  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  const scroll = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  try {
    const view = render(
      <QueryClientProvider client={client}>
        <LiveChatSection />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sample visitor/ }));
    expect(
      await screen.findByText("Can we discuss the roadmap?"),
    ).toBeVisible();
    expect(scroll).toHaveBeenCalledWith({ block: "end" });
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(() => view.unmount()).not.toThrow();
    expect(api.removeChannel).toHaveBeenCalledTimes(1);
  } finally {
    client.clear();
    if (original)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
