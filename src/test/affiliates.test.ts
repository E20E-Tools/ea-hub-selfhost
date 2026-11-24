// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: null as null | {
    userId: string;
    claims: unknown;
    supabase: {
      rpc: (
        name: string,
        args: unknown,
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  },
  role: vi.fn(),
  privilegedFrom: vi.fn(),
}));

// Exercise real validation and handlers, replacing only transport and data IO.
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
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data?: unknown }) => {
          if (protectedEndpoint && !mocks.context)
            throw new Error("Unauthorized");
          return handler({
            context: mocks.context,
            data: validate(args?.data),
          });
        },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.privilegedFrom },
}));

import {
  affiliateInputSchema,
  deleteAffiliate,
  saveAffiliate,
} from "@/lib/admin.functions";

const chain = {
  upsert: vi.fn(() => Promise.resolve({ error: null })),
  delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
};

beforeEach(() => {
  mocks.role.mockReset();
  mocks.privilegedFrom.mockReset();
  mocks.privilegedFrom.mockReturnValue(chain);
  chain.upsert.mockClear();
  mocks.context = {
    userId: "11111111-1111-1111-1111-111111111111",
    claims: { email: "admin@e20e.tools" },
    supabase: {
      rpc: (_name: string, args: unknown) => {
        mocks.role(args);
        return Promise.resolve({ data: true, error: null });
      },
    },
  };
});

const validInput = {
  id: "consultations",
  titleAr: "الاستشارات",
  titleEn: "Consultations",
  descriptionAr: "وصف",
  descriptionEn: "Description",
  imageUrl: "affiliates/consultations.jpg",
  url: "https://www.dt.guide/itconsultations/",
  sortOrder: 1,
};

describe("affiliates admin", () => {
  it("rejects anonymous callers", async () => {
    mocks.context = null;
    await expect(saveAffiliate({ data: validInput })).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("rejects non-admin sessions", async () => {
    mocks.context!.supabase.rpc = () =>
      Promise.resolve({ data: false, error: null });
    await expect(saveAffiliate({ data: validInput })).rejects.toThrow(
      "مخصّصة للإدارة",
    );
    expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  });

  it("rejects non-https external links", () => {
    const result = affiliateInputSchema.safeParse({
      ...validInput,
      url: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("accepts internal paths and rejects overlong fields", () => {
    expect(
      affiliateInputSchema.safeParse({ ...validInput, url: "/request" })
        .success,
    ).toBe(true);
    expect(
      affiliateInputSchema.safeParse({
        ...validInput,
        titleAr: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("upserts the row as an admin with mapped column names", async () => {
    const result = await saveAffiliate({ data: validInput });
    expect(result).toEqual({ ok: true });
    expect(mocks.privilegedFrom).toHaveBeenCalledWith("affiliates");
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "consultations",
        title_ar: "الاستشارات",
        image_url: "affiliates/consultations.jpg",
        url: "https://www.dt.guide/itconsultations/",
        sort_order: 1,
      }),
    );
  });

  it("deletes an affiliate as an admin", async () => {
    const result = await deleteAffiliate({ data: { id: "courses" } });
    expect(result).toEqual({ ok: true });
    expect(mocks.privilegedFrom).toHaveBeenCalledWith("affiliates");
  });
});
