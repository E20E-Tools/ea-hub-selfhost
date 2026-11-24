// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  contentSecurityPolicy,
  CSP_ENFORCED,
} from "@/lib/security-headers";
import { turnsFromMessages } from "@/lib/live-chat.server";

const headersFor = () => {
  const h = new Headers();
  applySecurityHeaders(h, []);
  return h;
};
const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];
const migration = (tag: string) =>
  readFileSync(`drizzle/migrations/${tag}.sql`, "utf8");

describe("anti-framing headers", () => {
  it("enforces frame-ancestors 'none' and X-Frame-Options DENY on the public domain", () => {
    const h = headersFor();
    expect(h.get("content-security-policy")).toBe(CSP_ENFORCED);
    expect(CSP_ENFORCED).toContain("frame-ancestors 'none'");
    expect(h.get("x-frame-options")).toBe("DENY");
  });
  it("enforces the full content policy instead of report-only", () => {
    const h = headersFor();
    expect(h.get("content-security-policy-report-only")).toBeNull();
    for (const d of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ])
      expect(CSP_ENFORCED).toContain(d);
    expect(CSP_ENFORCED).not.toContain("unsafe-eval");
  });
  it("allows what the site really loads: own fonts, Supabase realtime and model textures", () => {
    expect(CSP_ENFORCED).toMatch(/font-src 'self'/);
    expect(CSP_ENFORCED).toContain("wss://*.supabase.co");
    expect(CSP_ENFORCED).toMatch(/img-src [^;]*blob:/);
    expect(CSP_ENFORCED).toMatch(/connect-src [^;]*blob:/);
  });
  it("adds the configured backend origin (and its websocket) once, ignoring non-http values", () => {
    const policy = contentSecurityPolicy([
      "http://127.0.0.1:54365",
      "http://127.0.0.1:54365/",
      "not a url",
      "javascript:alert(1)",
    ]);
    const connect = directive(policy, "connect-src");
    expect(connect).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:54365",
        "ws://127.0.0.1:54365",
      ]),
    );
    expect(connect.filter((s) => s.includes("54365"))).toHaveLength(2);
    expect(directive(policy, "img-src")).toContain("http://127.0.0.1:54365");
    expect(directive(policy, "img-src")).not.toContain("ws://127.0.0.1:54365");
    expect(policy).not.toContain("javascript:");
    expect(contentSecurityPolicy([])).toBe(CSP_ENFORCED);
  });
  it("does not replace a policy a route already set", () => {
    const h = new Headers({ "content-security-policy": "default-src 'none'" });
    applySecurityHeaders(h, ["http://127.0.0.1:54365"]);
    expect(h.get("content-security-policy")).toBe("default-src 'none'");
  });
});

describe("assistant context mapping", () => {
  it("keeps only visitor/ai messages, oldest first, capped at 12", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `m${String(i).padStart(2, "0")}`,
      sender: i % 2 ? "ai" : "visitor",
      body: `b${i}`,
      created_at: new Date(Date.UTC(2026, 10, 16, 10, i)).toISOString(),
    })).reverse();
    const turns = turnsFromMessages([
      ...rows,
      {
        id: "x",
        sender: "admin",
        body: "team",
        created_at: "2026-11-16T11:00:00Z",
      },
    ]);
    expect(turns).toHaveLength(12);
    expect(turns[0]).toEqual({ role: "user", content: "b8" });
    expect(turns[11]).toEqual({ role: "assistant", content: "b19" });
  });
});

describe("database changes", () => {
  it("chat purge reads the chats retention days with a 90-day fallback", () => {
    const sql = migration("0070_chat_retention_reads_policy");
    expect(sql).toContain(
      "FROM public.retention_policies p WHERE p.data_type='chats'",
    );
    expect(sql).toContain("COALESCE(days_value, 90)");
    expect(sql).toContain("retention_candidates('chats',days_value,100)");
    expect(sql).not.toContain("retention_candidates('chats',90,100)");
  });
  it("drops the no-op signup trigger and its function", () => {
    const sql = migration("0071_drop_noop_signup_trigger");
    expect(sql).toContain(
      "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users",
    );
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.handle_new_user()");
  });
  it("revokes visitor access only on the twelve service-only tables", () => {
    const sql = migration("0072_revoke_service_only_table_grants");
    const revoked = [
      "rate_limit_events",
      "request_identities",
      "request_replies",
      "user_roles",
      "ai_assistant_settings",
      "application_telemetry",
      "assistant_registrations",
      "assistant_replies",
      "journey_event_receipts",
      "site_visits",
      "suggestion_requests",
      "support_offers",
    ];
    for (const table of revoked) expect(sql).toContain(`public.${table}`);
    expect(sql).toContain("FROM anon, authenticated");
    for (const kept of [
      "products",
      "site_settings",
      "live_chats",
      "retention_policies",
    ])
      expect(sql).not.toMatch(new RegExp(`public\\.${kept}\\b`));
  });
  it("drops both deprecated price columns and the types no longer list them", () => {
    const sql = migration("0073_drop_deprecated_product_pricing");
    expect(sql).toContain("DROP COLUMN IF EXISTS pricing,");
    expect(sql).toContain("DROP COLUMN IF EXISTS pricing_en");
    expect(
      readFileSync("src/integrations/supabase/types.ts", "utf8"),
    ).not.toMatch(/\bpricing/);
  });
});

describe("site files", () => {
  it("hides admin, my-requests and reset-password from all crawlers", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    const star = robots.slice(robots.indexOf("User-agent: *"));
    for (const path of ["/admin", "/my-requests", "/reset-password"])
      expect(star).toContain(`Disallow: ${path}\n`);
  });
  it("removes the archived October plan page and every link to it", () => {
    expect(existsSync("src/routes/october-plan.tsx")).toBe(false);
    expect(readFileSync("src/routes/index.tsx", "utf8")).not.toContain(
      "october-plan",
    );
  });
});
