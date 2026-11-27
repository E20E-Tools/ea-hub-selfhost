// @vitest-environment node
// Second improvement batch (16 Nov 2026): one block per numbered item.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archoneLaunchLabel,
  archoneSoonTarget,
  hasLaunched,
  launchGoogleCalendarHref,
  launchIcs,
  launchInstantFor,
  launchMonthGrid,
} from "@/lib/archone-launch";
import { mapProduct, type ProductRow } from "@/lib/catalog";
import {
  verifyTurnstile,
  turnstileConfig,
  TURNSTILE_VERIFY_URL,
} from "@/lib/turnstile.server";
import {
  budgetAlertThreshold,
  ipEmailSubject,
  REQUEST_GLOBAL_DAY_LIMIT,
} from "@/lib/ai-budget.shared";
import {
  deriveSigningSecret,
  deriveSigningSecrets,
  encryptSecret,
  openSecret,
  rootSecrets,
} from "@/lib/server-keys.server";
import {
  issueAccessToken,
  verifyAccessToken,
} from "@/lib/assistant-gate.server";
import {
  DESIGN_THEME_IDS,
  THEME_FONT_FAMILIES,
  themeFontsHref,
} from "@/lib/design-themes";
import {
  CATALOG_TTL_MS,
  SIGNED_URL_REUSE_MS,
  cachedCatalog,
  cachedSignedUrl,
  catalogGeneration,
  invalidateCatalogCache,
  rememberCatalog,
  rememberSignedUrl,
} from "@/lib/catalog-cache.server";
import { sitemapPaths } from "@/lib/sitemap.shared";
import {
  LANGUAGE_COOKIE,
  languageCookie,
  languageFromCookie,
} from "@/lib/language-core";
import { DEFAULT_NAVIGATION, readNavigation } from "@/lib/navigation.shared";
import {
  FEATURE_PATHS,
  isDisabledFeaturePath,
  normalizeFeatureFlags,
} from "@/lib/site-features";
import { aiFailureAlert, budgetAlerts } from "@/lib/operations.shared";

afterEach(() => vi.unstubAllEnvs());

const BEFORE = Date.parse("2026-11-22T05:59:00Z"); // 08:59 Riyadh
const AFTER = Date.parse("2026-11-22T06:00:00Z"); // 09:00 Riyadh

describe("1) ArchONE launch comes from products.publication_date", () => {
  it("launches ArchONE at 09:00 Riyadh on its publication date", () => {
    expect(launchInstantFor("archone", "2026-11-22")?.toISOString()).toBe(
      "2026-11-22T06:00:00.000Z",
    );
    expect(launchInstantFor("archone", "2026-12-05")?.toISOString()).toBe(
      "2026-12-05T06:00:00.000Z",
    );
    expect(launchInstantFor("archone", null)).toBeNull();
    expect(launchInstantFor("archone", "not-a-date")).toBeNull();
  });
  it("builds the countdown calendar, .ics file and Google link from the stored date", () => {
    const at = launchInstantFor("archone", "2026-12-05")!;
    expect(launchIcs(at)).toContain("DTSTART:20261205T060000Z");
    expect(launchIcs(at)).toContain("DTEND:20261205T070000Z");
    expect(
      new URL(launchGoogleCalendarHref(at, false)).searchParams.get("dates"),
    ).toBe("20261205T060000Z/20261205T070000Z");
    // November 2026 starts on a Sunday and has 30 days.
    const grid = launchMonthGrid(launchInstantFor("archone", "2026-11-22")!);
    expect(grid.day).toBe(22);
    expect(grid.cells[0]).toBe(1);
    expect(grid.cells.filter((c) => c !== null)).toHaveLength(30);
    expect(archoneLaunchLabel(false, "2026-12-05")).toBe("Launches 5 Dec 2026");
  });
  it("redirects to the product page once the launch moment has passed", () => {
    const archone = {
      id: "archone",
      comingSoon: true,
      publicationDate: "2026-11-22",
    };
    expect(archoneSoonTarget(archone, BEFORE)).toBeNull();
    expect(archoneSoonTarget(archone, AFTER)).toBe("product");
    expect(archoneSoonTarget({ ...archone, comingSoon: false }, BEFORE)).toBe(
      "product",
    );
    expect(archoneSoonTarget(undefined, BEFORE)).toBe("home");
  });
  it("shows a coming-soon product as available after its date without changing the stored flag", () => {
    const row = {
      id: "archone",
      name: "ArchONE",
      category: "architecture",
      label: "",
      description: "",
      overview: "",
      features: [],
      url: "https://example.test",
      keywords: "",
      coming_soon: true,
      image_url: "",
      image_alt: "",
      sort_order: 1,
      version: "",
      whats_new: "",
      publication_date: "2026-11-22",
    } as ProductRow;
    expect(mapProduct(row, "", BEFORE).comingSoon).toBe(true);
    const launched = mapProduct(row, "", AFTER);
    expect(launched.comingSoon).toBeFalsy();
    expect(launched.comingSoonSetting).toBe(true);
    expect(hasLaunched("archone", undefined, AFTER)).toBe(false);
  });
});

describe("2) Cloudflare Turnstile replaces the sum only when both keys are set", () => {
  it("is off unless both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileConfig()).toBeNull();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(turnstileConfig()).toEqual({ siteKey: "site", secretKey: "secret" });
  });
  it("verifies the token on the server through siteverify", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body as URLSearchParams;
        expect(body.get("secret")).toBe("secret");
        expect(body.get("response")).toBe("tok");
        expect(body.get("remoteip")).toBe("192.0.2.1");
        return Response.json({ success: true });
      },
    );
    const config = { siteKey: "site", secretKey: "secret" };
    expect(
      await verifyTurnstile(
        config,
        "tok",
        "192.0.2.1",
        fetcher as typeof fetch,
      ),
    ).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe(TURNSTILE_VERIFY_URL);
    const deny = (async () =>
      Response.json({ success: false })) as unknown as typeof fetch;
    expect(await verifyTurnstile(config, "tok", "192.0.2.1", deny)).toBe(false);
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(config, "tok", "192.0.2.1", down)).toBe(false);
    expect(
      await verifyTurnstile(config, "", "192.0.2.1", fetcher as typeof fetch),
    ).toBe(false);
  });
});

describe("3) limits tied to an unverified email use IP + email", () => {
  it("pairs the connection with the normalised email", () => {
    expect(ipEmailSubject("203.0.113.5", " Visitor@Example.COM ")).toBe(
      "203.0.113.5|visitor@example.com",
    );
    expect(ipEmailSubject("203.0.113.6", "visitor@example.com")).not.toBe(
      ipEmailSubject("203.0.113.5", "visitor@example.com"),
    );
  });
  it("raises the site-wide budget alert at 80%", () => {
    expect(budgetAlertThreshold(REQUEST_GLOBAL_DAY_LIMIT)).toBe(240);
    expect(budgetAlertThreshold(500)).toBe(400);
    const alerts = budgetAlerts(
      [
        { kind: "request", used: 239, limit: 300 },
        { kind: "chat", used: 400, limit: 500 },
      ],
      budgetAlertThreshold,
    );
    expect(alerts).toEqual([{ kind: "chat", used: 400, limit: 500 }]);
  });
});

describe("4) dedicated APP_ENCRYPTION_KEY with the old key as fallback", () => {
  it("uses APP_ENCRYPTION_KEY first when set and the service key otherwise", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "old-root");
    vi.stubEnv("APP_ENCRYPTION_KEY", "");
    expect(rootSecrets()).toEqual(["old-root"]);
    vi.stubEnv("APP_ENCRYPTION_KEY", "new-root");
    expect(rootSecrets()).toEqual(["new-root", "old-root"]);
  });
  it("opens values saved with the old key and asks for re-encryption with the new one", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "old-root");
    vi.stubEnv("APP_ENCRYPTION_KEY", "new-root");
    const oldValue = await encryptSecret("api-key-1", "old-root");
    expect(await openSecret(oldValue)).toEqual({
      plain: "api-key-1",
      rewrap: true,
    });
    const newValue = await encryptSecret("api-key-1");
    expect(await openSecret(newValue)).toEqual({
      plain: "api-key-1",
      rewrap: false,
    });
    expect(await openSecret(newValue, ["old-root"])).toEqual({
      plain: "",
      rewrap: false,
    });
  });
  it("accepts visitor tokens signed with either key during the switch-over", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "old-root");
    const oldSecret = await deriveSigningSecret(
      "assistant-gate-v1",
      "old-root",
    );
    const { token } = await issueAccessToken(
      oldSecret,
      "V",
      "v@example.com",
      Date.now(),
      "id-1",
    );
    vi.stubEnv("APP_ENCRYPTION_KEY", "new-root");
    const secrets = await deriveSigningSecrets("assistant-gate-v1");
    expect(secrets[0]).toBe(
      await deriveSigningSecret("assistant-gate-v1", "new-root"),
    );
    expect((await verifyAccessToken(secrets, token))?.visitorId).toBe("id-1");
    expect(await verifyAccessToken([secrets[0]!], token)).toBeNull();
  });
});

describe("5) only the active design's fonts are loaded", () => {
  it("loads no extra web fonts for any design: every design uses the bundled Cairo", () => {
    for (const id of DESIGN_THEME_IDS) expect(themeFontsHref(id), id).toBe("");
  });
  it("covers every font family each design's stylesheet uses", () => {
    const known = new Set(Object.values(THEME_FONT_FAMILIES).flat());
    for (const id of DESIGN_THEME_IDS) {
      const css = `src/themes/${id}/theme.css`;
      if (!existsSync(css)) continue;
      const text = readFileSync(css, "utf8");
      for (const family of known) {
        if (text.includes(`"${family}"`))
          expect(THEME_FONT_FAMILIES[id], `${id} ${family}`).toContain(family);
      }
    }
  });
  it("no longer loads every family from the root layout", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).not.toContain("THEME_FONTS_HREF");
  });
});

describe("6) server memory cache for signed links and the catalog", () => {
  it("reuses a signed link for an hour, well inside its 6-hour validity", () => {
    expect(SIGNED_URL_REUSE_MS).toBe(3_600_000);
    rememberSignedUrl("products/a.png", "https://signed/a", 1_000);
    expect(
      cachedSignedUrl("products/a.png", 1_000 + SIGNED_URL_REUSE_MS - 1),
    ).toBe("https://signed/a");
    expect(
      cachedSignedUrl("products/a.png", 1_000 + SIGNED_URL_REUSE_MS),
    ).toBeNull();
  });
  it("keeps the catalog 30-60 seconds and drops it on any admin save", () => {
    expect(CATALOG_TTL_MS).toBeGreaterThanOrEqual(30_000);
    expect(CATALOG_TTL_MS).toBeLessThanOrEqual(60_000);
    rememberCatalog({ v: 1 }, catalogGeneration(), 0);
    expect(cachedCatalog(CATALOG_TTL_MS - 1)).toEqual({ v: 1 });
    expect(cachedCatalog(CATALOG_TTL_MS)).toBeNull();
    rememberCatalog({ v: 2 }, catalogGeneration(), 0);
    rememberSignedUrl("products/b.png", "https://signed/b", 0);
    invalidateCatalogCache();
    expect(cachedCatalog(1)).toBeNull();
    expect(cachedSignedUrl("products/b.png", 1)).toBeNull();
  });
  it("never stores a catalog built before a save that happened during the build", () => {
    const started = catalogGeneration();
    invalidateCatalogCache();
    rememberCatalog({ stale: true }, started, 0);
    expect(cachedCatalog(1)).toBeNull();
  });
  it("admin saves clear the cache and the catalog no longer refetches on every focus", () => {
    expect(readFileSync("src/lib/admin.functions.ts", "utf8")).toMatch(
      /invalidateCatalogCache\(\)/,
    );
    expect(readFileSync("src/lib/catalog.functions.ts", "utf8")).not.toContain(
      'refetchOnWindowFocus: "always"',
    );
  });
});

describe("7) daily scheduled cleanup", () => {
  it("runs from an authenticated cron route, and chat creation and admin replies no longer purge", () => {
    const route = readFileSync(
      "src/routes/api/public/jobs/daily-cleanup.ts",
      "utf8",
    );
    expect(route.indexOf("authenticateCronRequest(request)")).toBeLessThan(
      route.indexOf("run_daily_maintenance"),
    );
    expect(readFileSync("src/lib/live-chat.server.ts", "utf8")).not.toContain(
      "purge_expired_chats_bounded",
    );
    expect(
      readFileSync("src/lib/live-chat.functions.ts", "utf8"),
    ).not.toContain("purgeExpiredChats(");
  });
});

describe("8) assistant_replies is retired", () => {
  // The first import of the server-function module loads TanStack Start cold; under a
  // full-suite run that alone can pass the default 5 s.
  it("admin reads AI replies from live_chat_messages", async () => {
    const { toAssistantReplyRow } =
      await import("@/lib/admin-monitor.functions");
    expect(
      toAssistantReplyRow({
        id: "m1",
        body: "answer",
        created_at: "2026-11-16T10:00:00Z",
        live_chats: {
          visitor_email: "v@example.com",
          visitor_name: "V",
          language: "en",
        },
      }),
    ).toEqual({
      id: "m1",
      visitor_email: "v@example.com",
      visitor_name: "V",
      reply: "answer",
      language: "en",
      created_at: "2026-11-16T10:00:00Z",
    });
    const files = readdirSync("src/lib").filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
    );
    for (const f of files) {
      expect(readFileSync(`src/lib/${f}`, "utf8"), f).not.toMatch(
        /from\("assistant_replies"\)/,
      );
    }
  }, 20_000);
});

describe("9) sitemap leaves out switched-off, hidden and empty pages", () => {
  const base = {
    featureFlags: {},
    navigationItems: DEFAULT_NAVIGATION,
    hasTestimonials: true,
    products: [
      { id: "radar", coming_soon: false, publication_date: null },
      { id: "archone", coming_soon: true, publication_date: "2026-11-22" },
    ],
    now: BEFORE,
  };
  it("drops /testimonials while nothing is published", () => {
    expect(sitemapPaths(base)).toContain("/testimonials");
    expect(sitemapPaths({ ...base, hasTestimonials: false })).not.toContain(
      "/testimonials",
    );
  });
  it("drops pages whose feature is switched off", () => {
    const paths = sitemapPaths({ ...base, featureFlags: { blog: false } });
    expect(paths).not.toContain("/about");
    expect(sitemapPaths(base)).toContain("/about");
  });
  it("drops pages only linked from hidden menu items", () => {
    const items = readNavigation(DEFAULT_NAVIGATION).map((i) =>
      i.url === "/affiliates" ? { ...i, hidden: true } : i,
    );
    expect(sitemapPaths({ ...base, navigationItems: items })).not.toContain(
      "/affiliates",
    );
  });
  it("lists the try page only for available or launched tools", () => {
    expect(sitemapPaths(base)).toContain("/try/radar");
    expect(sitemapPaths(base)).not.toContain("/try/archone");
    expect(sitemapPaths({ ...base, now: AFTER })).toContain("/try/archone");
  });
});

describe("10) language cookie for the first server response", () => {
  it("reads the saved language from the Cookie header", () => {
    expect(languageFromCookie(`a=1; ${LANGUAGE_COOKIE}=ar; b=2`)).toBe("ar");
    expect(languageFromCookie(`${LANGUAGE_COOKIE}=fr`)).toBeNull();
    expect(languageFromCookie(null)).toBeNull();
  });
  it("writes a year-long first-party cookie, Secure on https", () => {
    expect(languageCookie("ar", true)).toBe(
      `${LANGUAGE_COOKIE}=ar; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(languageCookie("en", false)).not.toContain("Secure");
  });
  it("the root layout sends lang/dir from the saved choice, respecting the Arabic switch", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toMatch(/effectiveLanguage\(/);
    expect(root).toMatch(/lang=\{lang\}/);
    expect(root).toMatch(/dir=\{directionOf\(lang\)\}/);
  });
});

describe("11) /about replaces /blog", () => {
  it("maps saved /blog menu links to /about and keeps the feature switch working", () => {
    const saved = [
      {
        id: "about",
        labelAr: "من نحن",
        labelEn: "About us",
        url: "/blog",
        hidden: false,
      },
    ];
    expect(readNavigation(saved)[0]?.url).toBe("/about");
    expect(FEATURE_PATHS.blog).toBe("/about");
    const off = normalizeFeatureFlags({ blog: false });
    expect(isDisabledFeaturePath(off, "/about")).toBe(true);
    expect(isDisabledFeaturePath(off, "/blog")).toBe(true);
  });
  it("/blog is a permanent redirect to /about", () => {
    const blog = readFileSync("src/routes/blog.tsx", "utf8");
    expect(blog).toMatch(/href: `\/about\$\{location.searchStr\}/);
    expect(blog).toMatch(/statusCode: 301/);
  });
});

describe("12) AI failure alert", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const row = (
    minutesAgo: number,
    outcome: "success" | "failure",
    operation = "assistant",
  ) => ({
    operation,
    outcome,
    created_at: new Date(now - minutesAgo * 60_000).toISOString(),
  });
  it("alerts after 3 failures in a row", () => {
    expect(
      aiFailureAlert(
        [
          row(1, "failure"),
          row(2, "failure"),
          row(3, "failure"),
          row(4, "success"),
        ],
        now,
      )?.reason,
    ).toBe("streak");
    expect(
      aiFailureAlert(
        [row(1, "failure"), row(2, "failure"), row(3, "success")],
        now,
      ),
    ).toBeNull();
  });
  it("alerts when more than 30% of the last hour's answers failed", () => {
    const rows = [
      row(1, "success"),
      row(2, "failure"),
      row(3, "success"),
      row(4, "failure"),
      row(5, "success"),
      row(6, "success"),
    ];
    expect(aiFailureAlert(rows, now)?.reason).toBe("rate"); // 2 of 6 = 33%
    expect(aiFailureAlert([...rows, row(7, "success")], now)).toBeNull(); // 2 of 7 = 28.6%
  });
  it("ignores request telemetry and answers older than an hour for the rate", () => {
    const rows = [
      row(1, "failure", "request"),
      row(2, "failure", "request"),
      row(3, "failure", "request"),
    ];
    expect(aiFailureAlert(rows, now)).toBeNull();
    const old = [
      row(1, "success"),
      row(70, "failure"),
      row(71, "failure"),
      row(72, "success"),
      row(73, "success"),
      row(74, "success"),
    ];
    expect(aiFailureAlert(old, now)).toBeNull();
  });
});
