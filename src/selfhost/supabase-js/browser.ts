import { fromTable, rpcCall } from "./builder";
import type { QueryResult, QuerySpec } from "./spec";
import { apiError, failure } from "./spec";

/**
 * Browser side of the self-hosted adapter. Everything goes to the same origin under
 * /api/selfhost/* — no third-party backend, no keys in the bundle.
 */

type User = Record<string, unknown> & {
  id: string;
  email?: string | undefined;
};
type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: User;
};
type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";
type AuthErr = {
  message: string;
  code?: string | undefined;
  status?: number | undefined;
  name: string;
};

const BASE = "/api/selfhost";
const KEY = "ea-hub-selfhost-auth";

function authErr(message: string, code?: string, status?: number): AuthErr {
  return {
    message,
    code,
    status,
    name: status ? "AuthApiError" : "AuthRetryableFetchError",
  };
}

async function call(
  path: string,
  init: RequestInit & { token?: string | undefined } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return fetch(`${BASE}/${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}

class BrowserAuth {
  private session: Session | null = null;
  private listeners = new Set<
    (event: AuthEvent, session: Session | null) => void
  >();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<Session | null> | undefined;
  private recovery = false;

  constructor(private readonly persist: boolean) {
    if (typeof window === "undefined") return;
    this.session = this.load();
    this.readRecoveryFragment();
    this.schedule();
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      const before = this.session?.access_token;
      this.session = this.load();
      if (before !== this.session?.access_token)
        this.emit(
          this.session
            ? before
              ? "TOKEN_REFRESHED"
              : "SIGNED_IN"
            : "SIGNED_OUT",
        );
    });
  }

  private load(): Session | null {
    if (!this.persist) return this.session;
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private save(session: Session | null) {
    this.session = session;
    if (this.persist) {
      try {
        if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
        else window.localStorage.removeItem(KEY);
      } catch {
        /* private mode: keep the in-memory session */
      }
    }
    this.schedule();
  }

  private readRecoveryFragment() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    if (!hash.includes("access_token=") && !hash.includes("error=")) return;
    const p = new URLSearchParams(hash);
    const clean = () =>
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    if (p.get("error")) return clean();
    const access = p.get("access_token");
    const refresh = p.get("refresh_token");
    if (!access || !refresh) return;
    let user: User = { id: "" };
    try {
      const claims = JSON.parse(
        atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
      ) as {
        sub: string;
        email?: string;
      };
      user = { id: claims.sub, email: claims.email };
    } catch {
      return clean();
    }
    this.save({
      access_token: access,
      refresh_token: refresh,
      expires_at:
        Number(p.get("expires_at")) || Math.floor(Date.now() / 1000) + 3600,
      expires_in: Number(p.get("expires_in")) || 3600,
      token_type: "bearer",
      user,
    });
    this.recovery = p.get("type") === "recovery";
    clean();
  }

  private schedule() {
    if (typeof window === "undefined") return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.session) return;
    const ms = Math.max(
      5_000,
      (this.session.expires_at - 60) * 1000 - Date.now(),
    );
    this.refreshTimer = setTimeout(
      () => void this.refresh(),
      Math.min(ms, 2 ** 31 - 1),
    );
  }

  private emit(event: AuthEvent) {
    for (const l of [...this.listeners]) {
      try {
        l(event, this.session);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async refresh(): Promise<Session | null> {
    if (!this.session) return null;
    if (!this.refreshing) {
      const token = this.session.refresh_token;
      this.refreshing = (async () => {
        try {
          const res = await call("auth/token?grant_type=refresh_token", {
            method: "POST",
            body: JSON.stringify({ refresh_token: token }),
          });
          if (res.ok) {
            this.save((await res.json()) as Session);
            this.emit("TOKEN_REFRESHED");
          } else if (res.status >= 400 && res.status < 500) {
            // Another tab may have rotated it already.
            const latest = this.load();
            if (latest && latest.refresh_token !== token) this.session = latest;
            else {
              this.save(null);
              this.emit("SIGNED_OUT");
            }
          }
        } catch {
          /* offline: keep the session, retry on next use */
        }
        return this.session;
      })().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async accessToken(): Promise<string | undefined> {
    if (!this.session) return undefined;
    if (this.session.expires_at - 30 <= Date.now() / 1000) await this.refresh();
    return this.session?.access_token;
  }

  async getSession() {
    if (this.session && this.session.expires_at - 30 <= Date.now() / 1000)
      await this.refresh();
    return { data: { session: this.session }, error: null };
  }

  async getUser(jwt?: string) {
    const token = jwt ?? (await this.accessToken());
    if (!token)
      return {
        data: { user: null },
        error: {
          ...authErr("Auth session missing!", "session_not_found", 400),
          name: "AuthSessionMissingError",
        },
      };
    try {
      const res = await call("auth/user", { token });
      const body = (await res.json()) as User & {
        message?: string;
        code?: string;
      };
      if (!res.ok)
        return {
          data: { user: null },
          error: authErr(
            body.message ?? "Request failed",
            body.code,
            res.status,
          ),
        };
      return { data: { user: body }, error: null };
    } catch (e) {
      return { data: { user: null }, error: authErr((e as Error).message) };
    }
  }

  async signInWithPassword(credentials: { email: string; password: string }) {
    try {
      const res = await call("auth/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });
      const body = (await res.json()) as Session & {
        message?: string;
        code?: string;
      };
      if (!res.ok)
        return {
          data: { user: null, session: null },
          error: authErr(
            body.message ?? "Sign-in failed",
            body.code,
            res.status,
          ),
        };
      this.recovery = false;
      this.save(body);
      this.emit("SIGNED_IN");
      return { data: { user: body.user, session: body }, error: null };
    } catch (e) {
      return {
        data: { user: null, session: null },
        error: authErr((e as Error).message),
      };
    }
  }

  async signOut(options: { scope?: "global" | "local" | "others" } = {}) {
    const token = this.session?.access_token;
    try {
      if (token)
        await call(`auth/logout?scope=${options.scope ?? "local"}`, {
          method: "POST",
          token,
        });
    } catch {
      /* local sign-out still happens */
    }
    if (options.scope !== "others") {
      this.recovery = false;
      this.save(null);
      this.emit("SIGNED_OUT");
    }
    return { error: null };
  }

  async resetPasswordForEmail(
    email: string,
    options: { redirectTo?: string } = {},
  ) {
    try {
      const res = await call("auth/recover", {
        method: "POST",
        body: JSON.stringify({ email, redirect_to: options.redirectTo }),
      });
      if (!res.ok)
        return {
          data: null,
          error: authErr("Recovery failed", undefined, res.status),
        };
      return { data: {}, error: null };
    } catch (e) {
      return { data: null, error: authErr((e as Error).message) };
    }
  }

  async updateUser(attrs: {
    password?: string;
    data?: Record<string, unknown>;
  }) {
    const token = await this.accessToken();
    if (!token)
      return {
        data: { user: null },
        error: authErr("Auth session missing!", "session_not_found", 401),
      };
    try {
      const res = await call("auth/user", {
        method: "PUT",
        token,
        body: JSON.stringify(attrs),
      });
      const body = (await res.json()) as User & {
        message?: string;
        code?: string;
      };
      if (!res.ok)
        return {
          data: { user: null },
          error: authErr(
            body.message ?? "Update failed",
            body.code,
            res.status,
          ),
        };
      if (this.session) this.save({ ...this.session, user: body });
      this.recovery = false;
      this.emit("USER_UPDATED");
      return { data: { user: body }, error: null };
    } catch (e) {
      return { data: { user: null }, error: authErr((e as Error).message) };
    }
  }

  async refreshSession() {
    const session = await this.refresh();
    return {
      data: { session, user: session?.user ?? null },
      error: session ? null : authErr("No session"),
    };
  }

  onAuthStateChange(
    callback: (event: AuthEvent, session: Session | null) => void,
  ) {
    this.listeners.add(callback);
    const initial: AuthEvent = this.recovery
      ? "PASSWORD_RECOVERY"
      : "INITIAL_SESSION";
    setTimeout(() => {
      if (this.listeners.has(callback)) callback(initial, this.session);
    }, 0);
    return {
      data: {
        subscription: {
          id: Math.random().toString(36).slice(2),
          callback,
          unsubscribe: () => {
            this.listeners.delete(callback);
          },
        },
      },
    };
  }
}

// ---------- realtime over Server-Sent Events ----------
type ChangeHandler = (payload: Record<string, unknown>) => void;

class Channel {
  private handlers: {
    id: number;
    event: string;
    schema: string;
    table: string;
    filter?: string | undefined;
    cb: ChangeHandler;
  }[] = [];
  private controller: AbortController | undefined;
  private closed = false;
  private attempt = 0;
  state = "closed";

  constructor(
    readonly topic: string,
    private readonly token: () => Promise<string | undefined>,
  ) {}

  on(
    type: string,
    filter: {
      event?: string;
      schema?: string;
      table?: string;
      filter?: string;
    },
    cb: ChangeHandler,
  ): this {
    if (type !== "postgres_changes") return this;
    this.handlers.push({
      id: this.handlers.length + 1,
      event: (filter.event ?? "*").toUpperCase(),
      schema: filter.schema ?? "public",
      table: filter.table ?? "",
      filter: filter.filter,
      cb,
    });
    return this;
  }

  subscribe(status?: (state: string, err?: Error) => void): this {
    this.closed = false;
    void this.connect(status);
    return this;
  }

  private async connect(status?: (state: string, err?: Error) => void) {
    if (this.closed || typeof window === "undefined") return;
    this.controller = new AbortController();
    try {
      const token = await this.token();
      const res = await call("realtime", {
        method: "POST",
        token,
        signal: this.controller.signal,
        body: JSON.stringify({
          subscriptions: this.handlers.map(
            ({ id, event, schema, table, filter }) => ({
              id,
              event,
              schema,
              table,
              filter,
            }),
          ),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`realtime ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (event === "ready") {
            this.attempt = 0;
            this.state = "joined";
            status?.("SUBSCRIBED");
          } else if (event === "change" && data) {
            const msg = JSON.parse(data) as {
              id: number;
              payload: Record<string, unknown>;
            };
            for (const h of this.handlers)
              if (h.id === msg.id) h.cb(msg.payload);
          }
        }
      }
    } catch (e) {
      if (this.closed) return;
      status?.("CHANNEL_ERROR", e as Error);
    }
    if (this.closed) return;
    this.state = "errored";
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
    setTimeout(() => void this.connect(status), delay);
  }

  async unsubscribe() {
    this.closed = true;
    this.state = "closed";
    this.controller?.abort();
    return "ok";
  }
}

// ---------- client ----------
export function createBrowserClient(
  _url: string,
  _key: string,
  options?: { auth?: { persistSession?: boolean } },
) {
  const auth = new BrowserAuth(options?.auth?.persistSession !== false);
  const channels = new Set<Channel>();

  const exec = async (spec: QuerySpec): Promise<QueryResult> => {
    const send = async (token: string | undefined) =>
      call("rest", { method: "POST", token, body: JSON.stringify({ spec }) });
    let res = await send(await auth.accessToken());
    if (res.status === 401) {
      await auth.refresh();
      res = await send(await auth.accessToken());
    }
    if (!res.ok && res.status !== 200) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };
      return failure(
        apiError(
          body.message ?? `HTTP ${res.status}`,
          body.code ?? String(res.status),
        ),
        res.status,
      );
    }
    return (await res.json()) as QueryResult;
  };

  return {
    auth,
    from: (table: string) => fromTable(exec, table),
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
      opts?: { head?: boolean; count?: "exact" },
    ) => rpcCall(exec, fn, args, opts),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (
          path: string,
          expiresIn: number,
          o: { download?: boolean | string } = {},
        ) => {
          try {
            const res = await call("storage/sign", {
              method: "POST",
              token: await auth.accessToken(),
              body: JSON.stringify({
                bucket,
                path,
                expiresIn,
                download: o.download,
              }),
            });
            return (await res.json()) as {
              data: { signedUrl: string } | null;
              error: unknown;
            };
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `${window.location.origin}${BASE}/storage/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
          },
        }),
        upload: async () => ({
          data: null,
          error: {
            message: "Uploads go through the server in the self-hosted build",
          },
        }),
        remove: async () => ({
          data: null,
          error: { message: "Not supported in the browser" },
        }),
        download: async () => ({
          data: null,
          error: { message: "Not supported in the browser" },
        }),
      }),
    },
    channel: (topic: string) => {
      const ch = new Channel(topic, () => auth.accessToken());
      channels.add(ch);
      return ch;
    },
    removeChannel: async (ch: Channel) => {
      channels.delete(ch);
      return ch.unsubscribe();
    },
    removeAllChannels: async () => {
      const all = [...channels];
      channels.clear();
      return Promise.all(all.map((c) => c.unsubscribe()));
    },
    getChannels: () => [...channels],
  };
}
