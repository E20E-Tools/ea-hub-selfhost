// @vitest-environment node
/**
 * End-to-end checks of the Postgres adapter against a real, migrated database.
 * Runs when SELFHOST_TEST_DATABASE_URL points at a database prepared by
 * `node selfhost/scripts/migrate.mjs` (CI does this with postgres:16); skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const url = process.env["SELFHOST_TEST_DATABASE_URL"];
const suite = url ? describe : describe.skip;

suite("self-host adapter (live database)", () => {
  let createServerClient: typeof import("../server/client").createServerClient;
  let handleSelfhost: typeof import("../server/http").handleSelfhost;
  let cfg: typeof import("../server/config");
  let admin: ReturnType<typeof createServerClient>;
  let anon: ReturnType<typeof createServerClient>;
  const email = `admin-${Date.now()}@example.com`;
  const password = "correct horse battery";
  let adminId = "";

  beforeAll(async () => {
    process.env["DATABASE_URL"] = url;
    process.env["APP_ENCRYPTION_KEY"] =
      "test-root-secret-that-is-long-enough-1234567890";
    process.env["APP_URL"] = "http://app.test";
    process.env["STORAGE_DIR"] = await mkdtemp(
      path.join(tmpdir(), "eahub-storage-"),
    );
    cfg = await import("../server/config");
    cfg.resetSelfhostConfig();
    ({ createServerClient } = await import("../server/client"));
    ({ handleSelfhost } = await import("../server/http"));
    admin = createServerClient("x", cfg.selfhostConfig().serviceKey);
    anon = createServerClient("x", "selfhost-anon");
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    adminId = created.data.user!.id;
    const role = await admin
      .from("user_roles")
      .insert({ user_id: adminId, role: "admin" });
    expect(role.error).toBeNull();
  });

  afterAll(async () => {
    if (adminId) await admin.auth.admin.deleteUser(adminId);
    const { db } = await import("../server/db");
    await db().end({ timeout: 2 });
  });

  it("reads, filters, counts and orders like PostgREST", async () => {
    const id = `selfhost-test-${Date.now()}`;
    const ins = await admin
      .from("products")
      .insert({ id, name: "Adapter test", category: "architecture" })
      .select("id, name")
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data).toEqual({ id, name: "Adapter test" });

    const list = await admin
      .from("products")
      .select("id, created_at")
      .eq("id", id);
    expect(list.data).toHaveLength(1);
    expect(typeof (list.data as { created_at: string }[])[0]!.created_at).toBe(
      "string",
    );

    const head = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    expect(head.count).toBe(1);
    expect(head.data).toBeNull();

    const or = await admin
      .from("products")
      .select("id")
      .or(`id.eq.${id},name.ilike.*nothing-matches*`);
    expect(or.data).toEqual([{ id }]);

    const none = await admin
      .from("products")
      .select("id")
      .eq("id", "missing")
      .maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });
    const single = await admin
      .from("products")
      .select("id")
      .eq("id", "missing")
      .single();
    expect(single.error?.code).toBe("PGRST116");

    const upd = await admin
      .from("products")
      .update({ name: "Renamed" })
      .eq("id", id)
      .select("name");
    expect(upd.data).toEqual([{ name: "Renamed" }]);
    const del = await admin.from("products").delete().in("id", [id]);
    expect(del.error).toBeNull();
  });

  it("enforces RLS for anon exactly like Supabase", async () => {
    const write = await anon
      .from("products")
      .insert({ id: "anon-write", name: "x", category: "architecture" });
    expect(write.error?.code).toBe("42501");
    const chats = await anon.from("live_chats").select("id");
    expect(
      chats.error?.code === "42501" ||
        (Array.isArray(chats.data) && chats.data.length === 0),
    ).toBe(true);
  });

  it("runs rpc with the caller's role", async () => {
    const limited = await admin.rpc("consume_rate_limit", {
      _bucket: "selfhost-test",
      _subject: `s-${Date.now()}`,
      _limit: 1,
      _window_seconds: 60,
    });
    expect(limited).toMatchObject({ data: true, error: null });
    const denied = await anon.rpc("consume_rate_limit", {
      _bucket: "selfhost-test",
      _subject: "x",
      _limit: 1,
      _window_seconds: 60,
    });
    expect(denied.error?.code).toBe("42501");
  });

  it("signs in, verifies, refreshes and signs out", async () => {
    const login = await handleSelfhost(
      new Request(
        "http://app.test/api/selfhost/auth/token?grant_type=password",
        {
          method: "POST",
          body: JSON.stringify({ email: email.toUpperCase(), password }),
        },
      ),
    );
    expect(login!.status).toBe(200);
    const session = (await login!.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string };
    };
    expect(session.user.id).toBe(adminId);

    const user = createServerClient("x", "selfhost-anon", {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    const isAdmin = await user.rpc("has_role", {
      _user_id: adminId,
      _role: "admin",
    });
    expect(isAdmin.data).toBe(true);
    const claims = await user.auth.getClaims(session.access_token);
    expect(claims.data?.claims["sub"]).toBe(adminId);

    const wrong = await handleSelfhost(
      new Request(
        "http://app.test/api/selfhost/auth/token?grant_type=password",
        {
          method: "POST",
          body: JSON.stringify({ email, password: "wrong password!" }),
        },
      ),
    );
    expect(wrong!.status).toBe(400);

    const refreshed = await handleSelfhost(
      new Request(
        "http://app.test/api/selfhost/auth/token?grant_type=refresh_token",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
      ),
    );
    expect(refreshed!.status).toBe(200);
    const next = (await refreshed!.json()) as { access_token: string };

    await handleSelfhost(
      new Request("http://app.test/api/selfhost/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${next.access_token}` },
      }),
    );
    const after = await admin.auth.getUser(next.access_token);
    expect(after.data.user).toBeNull();
  });

  it("single sign-on links, creates and promotes accounts only as configured", async () => {
    const { ssoSignIn, userFromToken } = await import("../server/auth");
    const base = {
      name: undefined,
      emailVerified: true,
      isAdmin: false,
      autoCreate: false,
    };
    const stranger = `sso-stranger-${Date.now()}@example.com`;
    // Unknown person, not listed as admin, no auto-create: refused, nothing created.
    expect(await ssoSignIn({ ...base, email: stranger })).toEqual({
      error: "not_allowed",
    });
    const missing = await admin.auth.admin.listUsers();
    expect(missing.data.users.some((u) => u.email === stranger)).toBe(false);

    // Existing account (the password admin): linked by verified e-mail, any case.
    const linked = await ssoSignIn({ ...base, email: email.toUpperCase() });
    expect("session" in linked && linked.session.user.id).toBe(adminId);
    if ("session" in linked)
      expect((await userFromToken(linked.session.access_token)).user?.id).toBe(
        adminId,
      );

    // An unverified e-mail is never linked to an existing account, even for "admins".
    expect(
      await ssoSignIn({ ...base, email, emailVerified: false, isAdmin: true }),
    ).toEqual({ error: "unverified_email" });

    // Listed admin without an account: created with the admin role.
    const boss = `sso-admin-${Date.now()}@example.com`;
    const created = await ssoSignIn({
      ...base,
      email: boss,
      name: "SSO Admin",
      isAdmin: true,
    });
    expect("session" in created).toBe(true);
    const bossId = "session" in created ? created.session.user.id : "";
    const roles = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", bossId);
    expect(roles.data).toEqual([{ role: "admin" }]);
    // Created without a password: password sign-in stays impossible.
    const pw = await handleSelfhost(
      new Request(
        "http://app.test/api/selfhost/auth/token?grant_type=password",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://app.test",
          },
          body: JSON.stringify({ email: boss, password: "anything-at-all" }),
        },
      ),
    );
    expect(pw!.status).toBe(400);
    await admin.auth.admin.deleteUser(bossId);
  });

  it("single sign-on works end to end through the HTTP routes (mock provider)", async () => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const { openPending, resetOidcCaches } = await import("../server/oidc");
    const { userFromToken } = await import("../server/auth");
    const ISSUER = "https://idp.test/realms/acme";
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = {
      ...publicKey.export({ format: "jwk" }),
      kid: "k",
      alg: "RS256",
    };
    let idToken = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u === `${ISSUER}/.well-known/openid-configuration`)
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/auth`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/certs`,
        });
      if (u === `${ISSUER}/certs`) return Response.json({ keys: [jwk] });
      if (u === `${ISSUER}/token`) return Response.json({ id_token: idToken });
      return realFetch(input as string, init);
    }) as typeof fetch;
    Object.assign(process.env, {
      OIDC_ISSUER: ISSUER,
      OIDC_CLIENT_ID: "ea-hub",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_ADMIN_GROUPS: "ea-admins",
      OIDC_BUTTON_LABEL: "Acme SSO",
    });
    resetOidcCaches();
    const signToken = (claims: Record<string, unknown>) => {
      const enc = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString("base64url");
      const head = enc({ alg: "RS256", kid: "k" });
      const body = enc(claims);
      return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
    };
    const go = (path: string, cookie?: string) =>
      handleSelfhost(
        new Request(
          `http://app.test${path}`,
          cookie ? { headers: { cookie } } : {},
        ),
      );
    try {
      const settings = await (await go("/api/selfhost/auth/settings"))!.json();
      expect(settings).toEqual({ sso: { enabled: true, label: "Acme SSO" } });

      const start = await go(
        `/api/selfhost/auth/oidc/start?redirect_to=${encodeURIComponent("http://app.test/admin")}`,
      );
      expect(start!.status).toBe(303);
      const to = new URL(start!.headers.get("location")!);
      expect(to.origin + to.pathname).toBe(`${ISSUER}/auth`);
      const cookie = start!.headers.get("set-cookie")!.split(";")[0]!;
      const pending = openPending(cookie.split("=").slice(1).join("="))!;
      expect(pending.state).toBe(to.searchParams.get("state"));

      const ssoEmail = `sso-e2e-${Date.now()}@example.com`;
      const now = Math.floor(Date.now() / 1000);
      idToken = signToken({
        iss: ISSUER,
        aud: "ea-hub",
        sub: "u1",
        iat: now,
        exp: now + 300,
        nonce: pending.nonce,
        email: ssoEmail,
        email_verified: true,
        groups: ["ea-admins"],
      });
      const back = await go(
        `/api/selfhost/auth/oidc/callback?code=c1&state=${pending.state}`,
        cookie,
      );
      expect(back!.status).toBe(303);
      expect(back!.headers.get("set-cookie")).toMatch(/Max-Age=0/);
      const landed = new URL(back!.headers.get("location")!);
      expect(landed.origin + landed.pathname).toBe("http://app.test/admin");
      const frag = new URLSearchParams(landed.hash.slice(1));
      expect(frag.get("type")).toBe("sso");
      const who = await userFromToken(frag.get("access_token")!);
      expect(who.user?.email).toBe(ssoEmail);
      const roles = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", who.user!.id);
      expect(roles.data).toEqual([{ role: "admin" }]);

      // Replaying the callback with a wrong state is refused.
      const bad = await go(
        `/api/selfhost/auth/oidc/callback?code=c1&state=forged`,
        cookie,
      );
      expect(bad!.headers.get("location")).toBe(
        "http://app.test/admin?sso_error=failed",
      );
      // A post-login redirect to another site is not allowed: it falls back to APP_URL.
      const off = await go(
        `/api/selfhost/auth/oidc/start?redirect_to=${encodeURIComponent("https://evil.example/x")}`,
      );
      const offCookie = off!.headers.get("set-cookie")!.split(";")[0]!;
      expect(
        openPending(offCookie.split("=").slice(1).join("="))!.redirect,
      ).toMatch(/^http:\/\/app\.test\//);
      await admin.auth.admin.deleteUser(who.user!.id);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of [
        "OIDC_ISSUER",
        "OIDC_CLIENT_ID",
        "OIDC_CLIENT_SECRET",
        "OIDC_ADMIN_GROUPS",
        "OIDC_BUTTON_LABEL",
      ])
        delete process.env[k];
      resetOidcCaches();
    }
  });

  it("serves the server status to admins only", async () => {
    const anonRes = await handleSelfhost(
      new Request("http://app.test/api/selfhost/status"),
    );
    expect(anonRes!.status).toBe(403);
    const { signInWithPassword } = await import("../server/auth");
    const signed = await signInWithPassword(email, password);
    const res = await handleSelfhost(
      new Request("http://app.test/api/selfhost/status", {
        headers: { authorization: `Bearer ${signed.session!.access_token}` },
      }),
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      version: string;
      checks: Record<string, { ok: boolean | null; detail: string }>;
    };
    expect(body.checks["database"]?.ok).toBe(true);
    expect(body.checks["database"]?.detail).toMatch(/PostgreSQL/);
    expect(Object.keys(body.checks)).toEqual(
      expect.arrayContaining([
        "migrations",
        "storage",
        "mail",
        "sso",
        "scheduledJobs",
      ]),
    );
    expect(JSON.stringify(body)).not.toMatch(/test-root-secret/);
  });

  it("stores files with signed URLs", async () => {
    const bucket = admin.storage.from("library-assets");
    const up = await bucket.upload(
      "tests/hello.txt",
      new Blob(["hi"], { type: "text/plain" }),
      { upsert: true },
    );
    expect(up.error).toBeNull();
    const signed = await bucket.createSignedUrl("tests/hello.txt", 60);
    expect(signed.data?.signedUrl).toMatch(
      /^http:\/\/app\.test\/api\/selfhost\/storage\/object\/sign\/library-assets\/tests\/hello\.txt\?token=/,
    );
    const res = await handleSelfhost(new Request(signed.data!.signedUrl));
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("hi");
    const tampered = await handleSelfhost(
      new Request(signed.data!.signedUrl.replace("hello", "other")),
    );
    expect(tampered!.status).toBe(400);
    const anonSign = await anon.storage
      .from("library-assets")
      .createSignedUrl("tests/hello.txt", 60);
    expect(anonSign.data).toBeNull();
    const rm = await bucket.remove(["tests/hello.txt"]);
    expect(rm.data).toHaveLength(1);
  });

  // PGlite (used for quick local runs) cannot deliver NOTIFY across connections.
  it.skipIf(process.env["SELFHOST_TEST_NO_NOTIFY"] === "1")(
    "streams realtime inserts the subscriber may read",
    async () => {
      const { realtimeStream } = await import("../server/realtime");
      const { SERVICE } = await import("../server/db");
      const abort = new AbortController();
      const res = realtimeStream(
        [{ id: 7, event: "INSERT", schema: "public", table: "live_chats" }],
        SERVICE,
        abort.signal,
        async () => true,
      );
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      while (!text.includes("event: ready"))
        text += (await reader.read()).value ?? "";
      const visitor = crypto.randomUUID();
      await admin
        .from("live_chats")
        .insert({ visitor_id: visitor, visitor_email: "rt@example.com" });
      const deadline = Date.now() + 5000;
      while (!text.includes(visitor) && Date.now() < deadline)
        text += (await reader.read()).value ?? "";
      abort.abort();
      expect(text).toContain(visitor);
      await admin.from("live_chats").delete().eq("visitor_id", visitor);
    },
    15_000,
  );

  it("embeds a many-to-one relation with !inner and an embedded filter", async () => {
    const chat = await admin
      .from("live_chats")
      .insert({
        visitor_id: crypto.randomUUID(),
        visitor_email: "v@example.com",
      })
      .select("id, visitor_id")
      .single();
    expect(chat.error).toBeNull();
    const c = chat.data as { id: string; visitor_id: string };
    const msg = await admin
      .from("live_chat_messages")
      .insert({ chat_id: c.id, sender: "ai", body: "hello" })
      .select("id")
      .single();
    const m = msg.data as { id: string };
    const hit = await admin
      .from("live_chat_messages")
      .select("chat_id,live_chats!inner(visitor_id)")
      .eq("id", m.id)
      .eq("live_chats.visitor_id", c.visitor_id)
      .maybeSingle();
    expect(hit.data).toEqual({
      chat_id: c.id,
      live_chats: { visitor_id: c.visitor_id },
    });
    const miss = await admin
      .from("live_chat_messages")
      .select("chat_id,live_chats!inner(visitor_id)")
      .eq("id", m.id)
      .eq("live_chats.visitor_id", crypto.randomUUID())
      .maybeSingle();
    expect(miss.data).toBeNull();
    await admin.from("live_chats").delete().eq("id", c.id);
  });
});
