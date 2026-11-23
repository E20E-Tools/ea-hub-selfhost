// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: null as null | {
    userId: string;
    claims: unknown;
    supabase: {
      rpc: (name: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
      from: (name: string) => unknown;
    };
  },
  role: vi.fn(),
  update: vi.fn(() => Promise.resolve({ error: null })),
  from: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let protectedEndpoint = false;
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => {
        protectedEndpoint = true;
        return builder;
      },
      inputValidator: (validator: (value: unknown) => unknown) => {
        validate = validator;
        return builder;
      },
      handler: (handler: (args: unknown) => unknown) => async (args?: { data?: unknown }) => {
        if (protectedEndpoint && !mocks.context) throw new Error("Unauthorized");
        return handler({ context: mocks.context, data: validate(args?.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { saveFeatureFlags } from "@/lib/admin.functions";
import { readNavigation } from "@/lib/navigation.shared";
import {
  defaultFeatureFlags,
  featureEnabled,
  isDisabledFeaturePath,
  normalizeFeatureFlags,
} from "@/lib/site-features";

beforeEach(() => {
  mocks.role.mockReset();
  mocks.update.mockReset();
  mocks.update.mockReturnValue(Promise.resolve({ error: null }));
  mocks.from.mockReset();
  mocks.from.mockReturnValue({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) });
  mocks.context = {
    userId: "11111111-1111-1111-1111-111111111111",
    claims: { email: "admin@e20e.tools" },
    supabase: {
      from: mocks.from,
      rpc: (_name: string, args: unknown) => {
        mocks.role(args);
        return Promise.resolve({ data: true, error: null });
      },
    },
  };
});

describe("site feature flags", () => {
  it("turns Archy off and on independently of support and other features", () => {
    const off = normalizeFeatureFlags({ ...defaultFeatureFlags, assistant: false });
    expect(featureEnabled(off, "assistant")).toBe(false);
    expect(featureEnabled(off, "support")).toBe(true);
    expect(featureEnabled(normalizeFeatureFlags({ ...off, assistant: true }), "assistant")).toBe(
      true,
    );
  });
  it("defaults every feature to on and keeps only explicit switches", () => {
    expect(normalizeFeatureFlags(null)).toEqual(defaultFeatureFlags);
    expect(
      normalizeFeatureFlags({ support: false, nonsense: false, recommendations: "no" }),
    ).toEqual({ ...defaultFeatureFlags, support: false });
  });

  it("treats missing flags as enabled", () => {
    expect(featureEnabled(undefined, "assistant")).toBe(true);
    const off = { ...defaultFeatureFlags, blog: false };
    expect(featureEnabled(off, "blog")).toBe(false);
    expect(featureEnabled(off, "support")).toBe(true);
  });

  it("hides menu links into switched-off features only", () => {
    const flags = { ...defaultFeatureFlags, support: false, affiliates: false };
    expect(isDisabledFeaturePath(flags, "/support")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/affiliates")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/support")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/")).toBe(false);
    expect(isDisabledFeaturePath(flags, "https://www.dt.guide/courses/")).toBe(false);
  });

  it("covers the newer pages: enterprise services, testimonials, terms and contact", () => {
    const flags = {
      ...defaultFeatureFlags,
      enterprise: false,
      testimonials: false,
      terms: false,
      contact: false,
    };
    expect(isDisabledFeaturePath(flags, "/enterprise-services")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/enterprise-services/request")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/testimonials")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/terms")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/contact")).toBe(true);
    expect(isDisabledFeaturePath(flags, "/request")).toBe(false);
  });

  it("defaults the newer features to on when saved flags predate them", () => {
    const legacy = { assistant: true, support: false };
    const normalized = normalizeFeatureFlags(legacy);
    expect(normalized.enterprise).toBe(true);
    expect(normalized.testimonials).toBe(true);
    expect(normalized.terms).toBe(true);
    expect(normalized.contact).toBe(true);
    expect(normalized.support).toBe(false);
  });
});

describe("hidden menu items", () => {
  it("keeps hidden items in the saved list and marks them hidden", () => {
    const items = readNavigation([
      { id: "home", labelAr: "الرئيسية", labelEn: "Home", url: "/", cta: false },
      {
        id: "blog",
        labelAr: "من نحن",
        labelEn: "About us",
        url: "/blog",
        cta: false,
        hidden: true,
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1]!.hidden).toBe(true);
    expect(items[0]!.hidden).not.toBe(true);
  });
});

describe("feature flags endpoint", () => {
  it("rejects anonymous callers", async () => {
    mocks.context = null;
    await expect(saveFeatureFlags({ data: defaultFeatureFlags })).rejects.toThrow("Unauthorized");
  });

  it("rejects non-admin sessions", async () => {
    mocks.context!.supabase.rpc = () => Promise.resolve({ data: false, error: null });
    await expect(saveFeatureFlags({ data: defaultFeatureFlags })).rejects.toThrow("مخصّصة للإدارة");
  });

  it("requires every feature key and ignores unknown ones", async () => {
    // Unknown keys are stripped; every known key is required.
    await expect(saveFeatureFlags({ data: { assistant: true } })).rejects.toThrow();
    const result = await saveFeatureFlags({
      data: { ...defaultFeatureFlags, extra: true } as Record<string, boolean>,
    });
    expect(result).toEqual({ ok: true });
  });

  it("saves the full switch set as an admin", async () => {
    const flags = { ...defaultFeatureFlags, support: false };
    const result = await saveFeatureFlags({ data: flags });
    expect(result).toEqual({ ok: true });
  });
});
