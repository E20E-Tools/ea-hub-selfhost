// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: {} as Record<string, boolean>,
  limits: 0,
  subscribed: 0,
  waitlisted: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const chain = {
      middleware: () => chain,
      inputValidator: (
        validator:
          { parse?: (v: unknown) => unknown } | ((v: unknown) => unknown),
      ) => {
        validate =
          typeof validator === "function"
            ? validator
            : (v: unknown) => (validator.parse ? validator.parse(v) : v);
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
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://x.test"),
}));
vi.mock("@/lib/site-features.server", () => ({
  serverFeatureEnabled: async (key: string) => state.enabled[key] !== false,
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "203.0.113.1",
  consumeLimits: async () => {
    state.limits++;
    return true;
  },
}));
vi.mock("@/lib/newsletter.server", () => ({
  subscribe: async () => {
    state.subscribed++;
    return { ok: true };
  },
  joinWaitlist: async () => {
    state.waitlisted++;
    return { ok: true };
  },
}));

import { featureFlagsSchema } from "@/lib/admin.functions";
import { joinNewsletter, joinWaitlist } from "@/lib/newsletter.functions";
import {
  FEATURE_KEYS,
  FEATURE_PATHS,
  LEGACY_FEATURE_KEYS,
  defaultFeatureFlags,
  isDisabledFeaturePath,
  normalizeFeatureFlags,
  type FeatureKey,
} from "@/lib/site-features";

const NEW_KEYS: FeatureKey[] = [
  "discover",
  "compare",
  "myTools",
  "trials",
  "waitlist",
  "newsletter",
  "search",
];

beforeEach(() =>
  Object.assign(state, {
    enabled: {},
    limits: 0,
    subscribed: 0,
    waitlisted: 0,
  }),
);

describe("new feature switches", () => {
  it("are registered, on by default and keep the original eleven first", () => {
    expect(FEATURE_KEYS.slice(11)).toEqual(NEW_KEYS);
    expect(LEGACY_FEATURE_KEYS).toHaveLength(11);
    for (const key of NEW_KEYS) expect(defaultFeatureFlags[key]).toBe(true);
    expect(normalizeFeatureFlags({ assistant: false }).discover).toBe(true);
  });

  it("settings saved before the new switches still validate and keep them on", () => {
    const legacy = Object.fromEntries(
      LEGACY_FEATURE_KEYS.map((k) => [k, true]),
    );
    const parsed = featureFlagsSchema.parse(legacy);
    for (const key of NEW_KEYS) expect(parsed[key]).toBe(true);
  });

  it("a saved off state survives validation and a missing original switch is still refused", () => {
    const all = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
    expect(featureFlagsSchema.parse({ ...all, compare: false }).compare).toBe(
      false,
    );
    const { assistant: _omit, ...noAssistant } = all;
    expect(featureFlagsSchema.safeParse(noAssistant).success).toBe(false);
  });

  it("switching one page off hides only that page's links", () => {
    const pages = [
      "discover",
      "compare",
      "myTools",
      "trials",
      "newsletter",
    ] as const;
    for (const key of pages) {
      const flags = normalizeFeatureFlags({ [key]: false });
      const own = FEATURE_PATHS[key]!;
      expect(isDisabledFeaturePath(flags, own)).toBe(true);
      expect(isDisabledFeaturePath(flags, `${own}/radar`)).toBe(true);
      for (const other of pages.filter((k) => k !== key)) {
        expect(isDisabledFeaturePath(flags, FEATURE_PATHS[other]!)).toBe(false);
      }
      expect(isDisabledFeaturePath(flags, "/contact")).toBe(false);
      expect(isDisabledFeaturePath(flags, "/my-requests")).toBe(false);
    }
  });

  it("the trials switch covers every planning exercise page but not the tool page", () => {
    const flags = normalizeFeatureFlags({ trials: false });
    expect(isDisabledFeaturePath(flags, "/try/radar")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/product/radar")).toBe(false);
  });
});

describe("server refuses switched-off sign-ups", () => {
  const signup = { email: "visitor@example.com", lang: "en" as const };
  const waitlist = {
    productId: "platform",
    email: "visitor@example.com",
    lang: "en" as const,
    problem: "",
  };

  it("newsletter off: no quota spent, nothing subscribed", async () => {
    state.enabled["newsletter"] = false;
    await expect(joinNewsletter({ data: signup })).rejects.toThrow();
    expect(state.limits).toBe(0);
    expect(state.subscribed).toBe(0);
  });

  it("newsletter on: sign-up goes through", async () => {
    await joinNewsletter({ data: signup });
    expect(state.subscribed).toBe(1);
  });

  it("waitlist off: refused before any write", async () => {
    state.enabled["waitlist"] = false;
    const result = await joinWaitlist({ data: waitlist });
    expect(result.ok).toBe(false);
    expect(state.limits).toBe(0);
    expect(state.waitlisted).toBe(0);
  });

  it("waitlist on: sign-up goes through, and the newsletter switch does not affect it", async () => {
    state.enabled["newsletter"] = false;
    const result = await joinWaitlist({ data: waitlist });
    expect(result.ok).toBe(true);
    expect(state.waitlisted).toBe(1);
  });
});
