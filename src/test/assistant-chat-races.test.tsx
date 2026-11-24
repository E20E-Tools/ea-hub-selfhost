import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyKey, sessionKey } from "@/lib/assistant-storage";

type User = { id: string; email: string; email_confirmed_at: string };
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  listener: null as null | ((event: string, s: { user: unknown } | null) => void),
  listeners: new Set<(event: string, s: { user: unknown } | null) => void>(),
  send: vi.fn(),
  readChats: vi.fn(),
  eqs: [] as [string, string, unknown][],
}));

vi.mock("@/lib/archy-quality.functions",()=>({getProductReviews:async()=>[],rateArchyReply:vi.fn()}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/archy-tour-visit-client", () => ({
  currentTourVisit: () => "",
  updateBrowserTourVisit: vi.fn(),
}));
const routerPath = vi.hoisted(() => ({ value: "/" }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: routerPath.value } }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/archy-scene", () => ({ default: () => <div data-testid="archy-scene" /> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: auth.getUser,
      getSession: async () => {
        const result = (await auth.getUser()) as { data: { user: unknown } };
        return { data: { session: result.data.user ? {} : null }, error: null };
      },
      signInWithOtp: async () => ({ error: null }),
      onAuthStateChange: (cb: typeof auth.listener) => {
        auth.listener = cb;
        if (cb) auth.listeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                if (cb) auth.listeners.delete(cb);
              },
            },
          },
        };
      },
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "in", "order", "limit"]) q[k] = () => q;
      q["eq"] = (col: string, val: unknown) => {
        auth.eqs.push([table, col, val]);
        return q;
      };
      q["maybeSingle"] = async () => ({ data: null });
      return q;
    },
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: async () => undefined,
  },
}));
vi.mock("@/lib/chat-feedback.functions", () => ({
  rateLiveChat: vi.fn(),
  readVisitorRating: vi.fn(async () => null),
}));
vi.mock("@/lib/live-chat.functions", () => ({
  requestHumanChat: vi.fn(),
  sendVisitorLiveMessage: vi.fn(),
  endVisitorLiveChat: vi.fn(),
  readVisitorChats: (...args: unknown[]) => auth.readChats(...args),
}));
vi.mock("@/lib/assistant-chat.functions", () => ({
  getAssistantChallenge: async () => ({ mode: "math", a: 1, b: 2, token: "c" }),
  registerAssistantVisitor: vi.fn(),
  sendAssistantMessage: (...args: unknown[]) => auth.send(...args),
}));
vi.mock("@/lib/archy-visitor.functions", () => ({ getMyArchySummary: vi.fn(async () => null) }));
vi.mock("@/lib/catalog.functions", () => ({
  catalogQueryOptions: {
    queryKey: ["catalog"],
    queryFn: async () => ({
      products: [
        {
          id: "landscape",
          name: "Landscape",
          category: "technology",
          label: "Technology map",
          description: "Application map",
          overview: "The real Landscape tool details inside the chat.",
          features: ["Application relationships"],
          url: "https://example.com/landscape",
          keywords: "landscape",
        },
      ],
    }),
  },
}));

const user = (id: string): User => ({
  id,
  email: `${id}@example.com`,
  email_confirmed_at: "2026-01-01",
});
const seed = (id: string, history: { role: string; content: string }[] = []) => {
  localStorage.setItem(
    sessionKey(id),
    JSON.stringify({ token: `t-${id}`, name: id, exp: Date.now() + 3_600_000 }),
  );
  localStorage.setItem(historyKey(id), JSON.stringify(history));
};
const emit = (u: User | null) =>
  act(() => {
    for (const listener of auth.listeners)
      listener(u ? "SIGNED_IN" : "SIGNED_OUT", u ? { user: u } : null);
  });

async function mount(initial: Promise<{ data: { user: User | null } }>) {
  auth.getUser.mockReturnValue(initial);
  const { AssistantChat } = await import("@/components/assistant-chat");
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <AssistantChat />
    </QueryClientProvider>,
  );
  // The launcher commits a tick after the first render; clicking before then found nothing.
  // Flush microtasks rather than waitFor, which stalls when a test runs on fake timers.
  let toggle = view.container.querySelector(".assistant-toggle");
  for (let i = 0; !toggle && i < 50; i++) {
    await act(async () => undefined);
    toggle = view.container.querySelector(".assistant-toggle");
  }
  if (!toggle) throw new Error("Archy launcher did not render");
  fireEvent.click(toggle);
  // Owner request: clicking Archy opens the existing chat directly (no floating card).
  return view;
}
async function sendMessage(container: HTMLElement, text: string) {
  const box = container.querySelector(".assistant-form textarea") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.submit(box.closest("form")!);
  });
}
const reply = (summary: string) => ({ ok: true, reply: { summary, picks: [] } });

// The first test loads the whole chat module graph; on a cold cache that alone can pass 5s.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  routerPath.value = "/";
  Element.prototype.scrollIntoView = () => undefined;
  localStorage.clear();
  auth.listener = null;
  auth.listeners.clear();
  auth.send.mockReset();
  auth.readChats.mockReset();
  auth.readChats.mockResolvedValue({ chats: [], messages: [], hasMore: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("opens registration from Archy without sending anything", async () => {
  const view = await mount(Promise.resolve({ data: { user: null } }));
  await act(async () => undefined);
  expect(view.container.querySelector("#assistant-panel .assistant-gate")).not.toBeNull();
  expect(view.container.querySelector("#gate-name")).not.toBeNull();
  await waitFor(()=>expect(view.container.querySelector("#gate-answer")).not.toBeNull());
  expect(view.container.querySelector("#gate-verify-email")).toBeNull();
  expect(auth.send).not.toHaveBeenCalled();
});

it("on a tool page clicking Archy opens the gate directly without sending", async () => {
  routerPath.value = "/product/tech-radar";
  const view = await mount(Promise.resolve({ data: { user: null } }));
  await act(async () => undefined);
  expect(view.container.querySelector("#assistant-panel .assistant-gate")).not.toBeNull();
  expect(auth.send).not.toHaveBeenCalled();
});

it("drops a pending reply for A after switching to B", async () => {
  seed("a");
  seed("b", [{ role: "user", content: "hello from B" }]);
  const pending = deferred<unknown>();
  auth.send.mockReturnValue(pending.promise);
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  await sendMessage(view.container, "question A");
  emit(user("b"));
  await act(async () => pending.resolve(reply("REPLY FOR A")));
  expect(view.container.textContent).toContain("hello from B");
  expect(view.container.textContent).not.toContain("REPLY FOR A");
  expect(localStorage.getItem(historyKey("b"))).not.toContain("REPLY FOR A");
  expect(localStorage.getItem(historyKey("a"))).not.toContain("REPLY FOR A");
});

it("resetting a pending conversation never resurrects its old response", async () => {
  seed("a");
  const pending = deferred<unknown>();
  auth.send.mockReturnValue(pending.promise);
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  await sendMessage(view.container, "old pending question");
  fireEvent.click(view.getByRole("button", { name: "New chat" }));
  await act(async () => pending.resolve(reply("STALE RESET REPLY")));
  expect(view.container.textContent).not.toContain("STALE RESET REPLY");
  expect(view.container.textContent).not.toContain("old pending question");
  expect(localStorage.getItem(historyKey("a"))).toBe("[]");
});

it("drops a pending reply for A after A -> B -> A", async () => {
  seed("a");
  seed("b");
  const pending = deferred<unknown>();
  auth.send.mockReturnValue(pending.promise);
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  await sendMessage(view.container, "old question");
  emit(user("b"));
  emit(user("a"));
  await act(async () => pending.resolve(reply("STALE REPLY")));
  expect(view.container.textContent).not.toContain("STALE REPLY");
  expect(localStorage.getItem(historyKey("a"))).not.toContain("STALE REPLY");
  // The newer A session is not stuck in the busy state left by the old request.
  expect(view.container.querySelector(".animate-spin")).toBeNull();
});

it("ignores a delayed initial getUser that resolves after a newer auth event", async () => {
  seed("a", [{ role: "user", content: "history of A" }]);
  seed("b", [{ role: "user", content: "history of B" }]);
  const initial = deferred<{ data: { user: User | null } }>();
  const view = await mount(initial.promise);
  emit(user("b"));
  await act(async () => initial.resolve({ data: { user: user("a") } }));
  expect(view.container.textContent).toContain("history of B");
  expect(view.container.textContent).not.toContain("history of A");
});

it("drops a pending reply when the visitor signs out", async () => {
  seed("a");
  const pending = deferred<unknown>();
  auth.send.mockReturnValue(pending.promise);
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  await sendMessage(view.container, "private signout fixture question");
  emit(null);
  await act(async () => pending.resolve(reply("AFTER SIGNOUT")));
  expect(view.container.textContent).not.toContain("AFTER SIGNOUT");
  expect(view.container.textContent).not.toContain("private signout fixture question");
  expect(view.container.querySelector(".assistant-gate")).not.toBeNull();
  expect(localStorage.getItem(historyKey("a"))).not.toContain("AFTER SIGNOUT");
});

it("keeps working when localStorage itself throws on access", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("denied");
    },
  });
  try {
    const view = await mount(Promise.resolve({ data: { user: user("a") } }));
    await act(async () => undefined);
    emit(user("b"));
    // No stored session can be read, so the registration step is shown instead of a crash.
    expect(view.container.querySelector(".assistant-gate")).not.toBeNull();
  } finally {
    Object.defineProperty(window, "localStorage", original);
  }
});

it("opens a reply's tool page inside the chat and returns to the same replies", async () => {
  seed("a", [{ role: "assistant", content: "[Landscape](/product/landscape)" }]);
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  const replyLink = view.container.querySelector('.assistant-msg a[href="/product/landscape"]')!;
  fireEvent.click(replyLink);
  expect(view.container.querySelector(".assistant-product")).not.toBeNull();
  expect(view.getByRole("heading", { name: "Landscape" })).not.toBeNull();
  expect(view.container.textContent).toContain("The real Landscape tool details inside the chat.");
  expect(view.container.querySelector(".assistant-log")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Back to chat" }));
  expect(view.container.querySelector(".assistant-product")).toBeNull();
  expect(
    view.container.querySelector('.assistant-msg a[href="/product/landscape"]'),
  ).not.toBeNull();
});

it("reads team chats using the signed visitor access token", async () => {
  auth.eqs.length = 0;
  seed("admin1");
  await mount(Promise.resolve({ data: { user: user("admin1") } }));
  await act(async () => undefined);
  const { readVisitorChats } = await import("@/lib/live-chat.functions");
  expect(typeof readVisitorChats).toBe("function");
  expect(auth.readChats).toHaveBeenCalledWith({ data: { access: "t-admin1" } });
});

it("polls only the open team chat and stops after closing, with failed reads handled", async () => {
  seed("a");
  const chat = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "active",
    created_at: "2026-11-13",
    last_message_at: "2026-11-13",
  };
  auth.readChats.mockResolvedValue({ chats: [chat], messages: [], hasMore: false });
  vi.useFakeTimers();
  const view = await mount(Promise.resolve({ data: { user: user("a") } }));
  await act(async () => undefined);
  auth.readChats.mockRejectedValue(new Error("offline"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(view.container.textContent).toContain("The reply could not be sent right now");
  const closeButton = view.getAllByRole("button", { name: /^Close$/ })[0];
  if (!closeButton) throw new Error("Missing close button");
  fireEvent.click(closeButton);
  const count = auth.readChats.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(auth.readChats).toHaveBeenCalledTimes(count);
  vi.useRealTimers();
});

