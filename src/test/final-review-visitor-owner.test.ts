import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  load: vi.fn((_store: unknown, owner: string) => ({
    session: { token: owner === "guest-v2" ? "guest-pass" : `pass-${owner}` },
    history: [],
  })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: h.getSession, getUser: h.getUser } },
}));
vi.mock("@/lib/assistant-storage", () => ({
  GUEST_CHAT_OWNER: "guest-v2",
  loadAccountState: h.load,
}));

import {
  currentViewer,
  currentVisitorAccess,
} from "@/lib/current-visitor-access";

const noSession = { data: { session: null }, error: null };
const someSession = { data: { session: { access_token: "jwt" } }, error: null };
const unknown = { token: "", accountId: "" };

beforeEach(() => {
  h.getSession.mockReset();
  h.getUser.mockReset();
  h.load.mockClear();
});

describe("which Archy pass the request pages may read", () => {
  it("a true guest (no local session) reads only the guest pass", async () => {
    h.getSession.mockResolvedValue(noSession);
    expect(await currentViewer()).toEqual({
      token: "guest-pass",
      accountId: "",
    });
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.load.mock.calls.map((c) => c[1])).toEqual(["guest-v2"]);
  });

  it("a validated account reads only its own pass", async () => {
    h.getSession.mockResolvedValue(someSession);
    h.getUser.mockResolvedValue({
      data: { user: { id: "acct-1" } },
      error: null,
    });
    expect(await currentViewer()).toEqual({
      token: "pass-acct-1",
      accountId: "acct-1",
    });
    expect(h.load.mock.calls.map((c) => c[1])).toEqual(["acct-1"]);
  });

  it("a present session rejected as missing (revoked session_not_found) is unknown, not guest", async () => {
    h.getSession.mockResolvedValue(someSession);
    h.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    expect(await currentViewer()).toEqual(unknown);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("an invalid JWT is unknown", async () => {
    h.getSession.mockResolvedValue(someSession);
    h.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
    });
    expect(await currentViewer()).toEqual(unknown);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("a present session with no user returned is unknown", async () => {
    h.getSession.mockResolvedValue(someSession);
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await currentViewer()).toEqual(unknown);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("a getSession error or throw is unknown", async () => {
    h.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("refresh failed", 0),
    });
    expect(await currentViewer()).toEqual(unknown);
    h.getSession.mockImplementation(() =>
      Promise.reject(new Error("storage blocked")),
    );
    expect(await currentVisitorAccess()).toBe("");
    expect(h.load).not.toHaveBeenCalled();
  });

  it("a thrown getUser network failure is unknown", async () => {
    h.getSession.mockResolvedValue(someSession);
    h.getUser.mockImplementation(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    expect(await currentVisitorAccess()).toBe("");
    expect(h.load).not.toHaveBeenCalled();
  });
});
