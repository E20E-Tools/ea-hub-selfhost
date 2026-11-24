// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ sql: null as unknown }));
vi.mock("postgres", () => ({ default: () => harness.sql }));
it("confirms consent and sends a monthly digest only once, then unsubscribes", async () => {
  const db = await PGlite.create();
  type Queryable = Pick<PGlite, "query">;
  function tag(client: Queryable) {
    return async (strings: TemplateStringsArray, ...args: unknown[]) =>
      (
        await client.query(
          strings.reduce((s, v, i) => s + (i ? "$" + i : "") + v, ""),
          args,
        )
      ).rows;
  }
  harness.sql = Object.assign(tag(db), {
    begin: <T>(fn: (q: ReturnType<typeof tag>) => Promise<T>) =>
      db.transaction((tx) => fn(tag(tx))),
  });
  vi.stubEnv("POSTGRES_URL", "isolated");
  vi.stubEnv("RESEND_API_KEY", "fixture");
  vi.stubEnv("NEWSLETTER_FROM", "sender@example.test");
  const out: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("https://api.resend.com/emails");
    out.push(JSON.parse(String(init.body)).text);
    return new Response("{}");
  });
  try {
    const migration = await readFile(
      "drizzle/migrations/0078_archy_health_newsletter.sql",
      "utf8",
    );
    await db.exec(
      migration.slice(
        migration.indexOf("create table public.newsletter_members"),
        migration.indexOf("do $$ declare"),
      ),
    );
    await db.exec(
      "create table products(id text primary key,coming_soon boolean,publication_date date,name text,description text,description_en text,whats_new text,whats_new_en text,updated_at timestamptz)",
    );
    const follows = await readFile(
      "drizzle/migrations/0079_product_follow_quality.sql",
      "utf8",
    );
    await db.exec(
      follows.slice(
        follows.indexOf("alter table public.newsletter_members"),
        follows.indexOf("alter table public.newsletter_launch_alerts enable"),
      ),
    );
    await db.exec(
      "insert into products(id,name,coming_soon) values('radar','Radar',true)",
    );
    await db.exec(
      (
        await readFile("drizzle/migrations/0086_work_assistant.sql", "utf8")
      ).split("revoke all")[0]!,
    );
    const n = await import("@/lib/newsletter.server");
    await n.subscribe("visitor@example.test", "ar");
    await n.subscribe("visitor@example.test", "ar");
    expect(out).toHaveLength(1);
    const token = new URLSearchParams(out[0]!.split("#")[1]).get("token")!;
    expect((await n.newsletterStatus()).active).toBe(0);
    expect(await n.manage(token, "confirm")).toBe(true);
    await n.addUpdate("مستجد تجريبي", "Fixture update", "/discover");
    await db.exec(
      "update newsletter_members set confirmed_at=now()-interval '2 months'; update newsletter_updates set created_at=date_trunc('month',now())-interval '3 days'",
    );
    await n.subscribe("only-radar@example.test", "en", {
      general: false,
      products: ["radar"],
    });
    const secondToken = new URLSearchParams(out.at(-1)!.split("#")[1]).get(
      "token",
    )!;
    await n.manage(secondToken, "confirm");
    await db.exec(
      "update newsletter_members set confirmed_at=now()-interval '2 months';update products set description='رادار',description_en='Radar release',updated_at=date_trunc('month',now())-interval '3 days' where id='radar'",
    );
    const issueMonth = (
      await db.query<{ month: string }>(
        "select to_char(now()-interval '1 month','YYYY-MM') as month",
      )
    ).rows[0]!.month;
    const sources = await n.previewIssue(issueMonth);
    await expect(
      n.approveEditorial(issueMonth, "ar", "نص بلا روابط"),
    ).rejects.toThrow("Keep source links");
    for (const lang of ["ar", "en"] as const) {
      const edited =
        (lang === "ar" ? "مراجعة الفريق" : "Reviewed by the team") +
        "\n" +
        sources[lang];
      await n.approveEditorial(issueMonth, lang, edited);
      expect((await n.previewIssue(issueMonth))[lang]).toBe(edited);
    }
    vi.stubEnv("NEWSLETTER_MONTHLY_ENABLED", "false");
    const offset = out.length;
    expect((await n.sendDue()).delivered).toBe(0);
    expect(out).toHaveLength(offset);
    vi.stubEnv("NEWSLETTER_MONTHLY_ENABLED", "true");
    expect((await n.sendDue()).delivered).toBe(2);
    const delivered = out.slice(offset);
    expect(delivered.some((s) => s.includes("مستجد تجريبي"))).toBe(true);
    expect(delivered.some((s) => s.includes("مراجعة الفريق"))).toBe(true);
    await expect(
      n.approveEditorial(issueMonth, "en", sources.en),
    ).rejects.toThrow("Issue already finalized");
    const only = delivered.find((s) => s.includes("Radar release"))!;
    expect(only).toContain("/product/radar");
    expect(only).not.toContain("Fixture update");
    expect((await n.sendDue()).delivered).toBe(0);
    const month = (
      await db.query<{ month: string }>(
        "select month::text from newsletter_issues",
      )
    ).rows[0]!.month.slice(0, 7);
    expect((await n.previewIssue(month)).en).toContain("Fixture update");
    await n.sendPreview(month, "ar", "admin@example.test");
    expect(out.at(-1)).toContain("مستجد تجريبي");
    await n.manage(secondToken, "unsubscribe");
    const prefs = await n.preferences(token, {
      general: false,
      products: ["radar"],
    });
    expect(prefs.products).toEqual(["radar"]);
    await db.exec("update products set coming_soon=false where id='radar'");
    const count = out.length;
    await n.sendDue();
    expect(out.length).toBe(count + 1);
    expect(out.at(-1)).toContain("Radar");
    await n.sendDue();
    expect(out.length).toBe(count + 1);
    expect(await n.manage(token, "unsubscribe")).toBe(true);
    expect((await n.newsletterStatus()).active).toBe(0);
    expect(await n.manage(token, "confirm")).toBe(false);
  } finally {
    await db.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
}, 30000);
