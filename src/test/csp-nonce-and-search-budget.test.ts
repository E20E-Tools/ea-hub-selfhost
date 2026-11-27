// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cached: false,
  buckets: [] as string[],
  searches: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const chain = {
      middleware: () => chain,
      inputValidator: (validator: typeof validate) => {
        validate = validator;
        return chain;
      },
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data: unknown }) =>
          handler({ data: validate(args?.data) }),
    };
    return chain;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.com/"),
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "192.0.2.7",
  consumeLimits: async (rules: { bucket: string }[]) => {
    state.buckets.push(...rules.map((rule) => rule.bucket));
    return true;
  },
}));
vi.mock("@/lib/semantic.server", () => ({
  semanticConfigured: () => true,
  queryCached: () => state.cached,
  semanticSearch: async () => {
    state.searches++;
    return [];
  },
}));

import {
  applySecurityHeaders,
  contentSecurityPolicy,
  createCspNonce,
  CSP_ENFORCED,
} from "@/lib/security-headers";
import {
  SEARCH_GLOBAL_BUCKET,
  SEARCH_GLOBAL_DAY_LIMIT,
  SEARCH_IP_DAY_LIMIT,
  searchByMeaning,
} from "@/lib/semantic.functions";

const scriptSrc = (policy: string) =>
  policy.split("; ").find((d) => d.startsWith("script-src ")) ?? "";

describe("CSP script nonce", () => {
  it("adds the request nonce to script-src only", () => {
    const nonce = createCspNonce();
    const policy = contentSecurityPolicy([], nonce);
    expect(scriptSrc(policy)).toContain(`'nonce-${nonce}'`);
    expect(policy.match(/'nonce-/g)).toHaveLength(1);
    // The other directives stay exactly as enforced today.
    expect(policy.replace(` 'nonce-${nonce}'`, "")).toBe(CSP_ENFORCED);
  });

  it("issues a fresh base64 nonce of 128 bits each time", () => {
    const a = createCspNonce();
    const b = createCspNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it.each([
    "",
    "short",
    "abc'; script-src *",
    "a b c d e f g h i j k l m n o p",
  ])("ignores an unusable nonce %j", (nonce) => {
    expect(contentSecurityPolicy([], nonce)).toBe(CSP_ENFORCED);
  });

  it("sets the nonce on the response header alongside backend origins", () => {
    const h = new Headers();
    const nonce = createCspNonce();
    applySecurityHeaders(h, ["http://127.0.0.1:54365"], nonce);
    const policy = h.get("content-security-policy") ?? "";
    expect(scriptSrc(policy)).toContain(`'nonce-${nonce}'`);
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("http://127.0.0.1:54365");
  });

  it("without a nonce keeps the previous policy unchanged", () => {
    const h = new Headers();
    applySecurityHeaders(h, []);
    expect(h.get("content-security-policy")).toBe(CSP_ENFORCED);
  });
});

describe("search by meaning budget", () => {
  beforeEach(() => {
    state.cached = false;
    state.buckets = [];
    state.searches = 0;
  });

  it("keeps one client's daily share well under the site-wide cap", () => {
    expect(SEARCH_IP_DAY_LIMIT * 10).toBeLessThanOrEqual(
      SEARCH_GLOBAL_DAY_LIMIT,
    );
  });

  it("charges a new query to the per-IP and site-wide budgets", async () => {
    await searchByMeaning({
      data: { query: "technology roadmap", language: "en" },
    });
    expect(state.buckets).toEqual([
      "search:ip",
      "search:ip-day",
      SEARCH_GLOBAL_BUCKET,
    ]);
    expect(state.searches).toBe(1);
  });

  it("does not spend the site-wide budget on a cached query", async () => {
    state.cached = true;
    await searchByMeaning({
      data: { query: "technology roadmap", language: "en" },
    });
    expect(state.buckets).toEqual(["search:ip", "search:ip-day"]);
    expect(state.searches).toBe(1);
  });
});
