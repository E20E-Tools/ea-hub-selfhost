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
