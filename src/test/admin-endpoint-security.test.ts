import { FEATURE_KEYS } from "@/lib/site-features";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: null as null | { userId: string; claims: unknown; supabase: unknown },
  role: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  privilegedFrom: vi.fn(),
  privilegedRpc: vi.fn(),
  storage: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
  download: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  range: vi.fn(),
  insert: vi.fn(),
  list: vi.fn(),
  signs: vi.fn(),
  del: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
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
      handler: (handler: (args: unknown) => unknown) => async (args?: { data?: unknown }) => {
        if (protectedEndpoint && !mocks.context) throw new Error("Unauthorized");
        return handler({ context: mocks.context, data: validate(args?.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: mocks.privilegedFrom,
    rpc: mocks.privilegedRpc,
    storage: { from: mocks.storage },
  },
}));

import * as endpoints from "@/lib/admin.functions";
import { defaultSettings } from "@/lib/catalog";

const product = {
  id: "security-fixture",
  name: "Test product",
  category: "architecture",
  categoryLabel: "Architecture",
  label: "Test label",
  description: "Test description only",
  overview: "Test overview only",
  features: [],
  version: "",
  whatsNew: "",
  url: "",
  keywords: "",
  comingSoon: true,
  imageUrl: "",
  imageAlt: "",
  sortOrder: 0,
};

function uploadData(bytes = new Uint8Array([1, 2, 3]), type = "image/png", folder = "products") {
  const data = new FormData();
  data.set("file", new File([bytes], "fixture.png", { type }));
  data.set("folder", folder);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context = {
    userId: "admin-fixture",
    claims: { aal: "aal2", email: "admin@example.com" },
    supabase: {
      rpc: mocks.role,
      auth: { getUser: mocks.user },
      from: mocks.from,
      storage: { from: mocks.storage },
    },
  };
  mocks.role.mockResolvedValue({ data: true, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockReturnValue({ limit: mocks.limit, range: mocks.range });
  mocks.range.mockResolvedValue({ data: [], error: null });
  mocks.limit.mockResolvedValue({ data: [], error: null });
  mocks.del.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mocks.maybeSingle }) }) });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.privilegedFrom.mockReturnValue({ select: mocks.select, insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.storage.mockReturnValue({
    upload: mocks.upload,
    createSignedUrl: mocks.sign,
    download: mocks.download,
    list: mocks.list,
    createSignedUrls: mocks.signs,
  });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.signs.mockResolvedValue({ data: [], error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.sign.mockResolvedValue({
    data: { signedUrl: "https://example.com/private-fixture" },
    error: null,
  });
});

const actions = [
  ["list admins", () => endpoints.listAdmins()],
  ["save product", () => endpoints.saveProduct({ data: product })],
  ["delete product", () => endpoints.deleteProduct({ data: { id: product.id } })],
  [
    "save general settings",
    () =>
      endpoints.saveGeneralSettings({
        data: {
          displayTitle: defaultSettings.displayTitle,
          displayTitleEn: "",
          arabicTitle: "",
          tagline: "",
          taglineEn: "",
          description: "A description long enough",
          descriptionEn: "",
          footerText: "",
          footerTextEn: "",
          logoUrl: "",
        },
      }),
  ],
  ["save appearance", () => endpoints.saveAppearanceSettings({ data: { imageFit: "cover" } })],
  ["save navigation", () => endpoints.saveNavigationSettings({ data: { items: [] } })],
  [
    "save categories",
    () => endpoints.saveCategories({ data: { categories: {}, categoriesEn: {} } }),
  ],
  [
    "change password",
    () =>
      endpoints.changeAdminPassword({
        data: { currentPassword: "old-password-1", password: "new-password-12" },
      }),
  ],
  ["delete affiliate", () => endpoints.deleteAffiliate({ data: { id: "courses" } })],
  ["read activity", () => endpoints.listAdminActivity()],
  ["read requests", () => endpoints.listRequests()],
  [
    "change request status",
    () =>
      endpoints.setRequestStatus({
        data: { id: "725e1a8f-01cb-4cdd-a274-72a373480b31", status: "resolved" },
      }),
  ],
  ["read support offers", () => endpoints.listSupportOffers()],
  [
    "change support offer status",
    () =>
      endpoints.setSupportOfferStatus({
        data: { id: "725e1a8f-01cb-4cdd-a274-72a373480b31", status: "replied" },
      }),
  ],
  ["upload image", () => endpoints.uploadAdminImage({ data: uploadData() })],
  ["read image gallery", () => endpoints.listAdminImages()],
  [
    "view request photo",
    () =>
      endpoints.getRequestAttachment({
        data: { id: "725e1a8f-01cb-4cdd-a274-72a373480b31", path: "r/image.png" },
      }),
  ],
] as const;

function expectNoDataAccess() {
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  expect(mocks.privilegedRpc).not.toHaveBeenCalled();
  expect(mocks.storage).not.toHaveBeenCalled();
  expect(mocks.user).not.toHaveBeenCalled();
}

describe("Every protected admin operation", () => {
  it.each(actions)("rejects anonymous callers: %s", async (_, action) => {
    mocks.context = null;
    await expect(action()).rejects.toThrow();
    expect(mocks.role).not.toHaveBeenCalled();
    expectNoDataAccess();
  });
  it.each(actions)("rejects ordinary users even with MFA: %s", async (_, action) => {
    mocks.role.mockResolvedValue({ data: false, error: null });
    await expect(action()).rejects.toThrow();
    expect(mocks.role).toHaveBeenCalledWith("has_role", {
      _user_id: "admin-fixture",
      _role: "admin",
    });
    expectNoDataAccess();
  });
  it.each(actions)("fails closed on role lookup errors: %s", async (_, action) => {
    mocks.role.mockResolvedValue({ data: true, error: { message: "unavailable" } });
    await expect(action()).rejects.toThrow();
    expectNoDataAccess();
  });
});

describe("Verified admin reads", () => {
  it("persists a coming-soon publication date and allows clearing it", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({
      upsert,
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { categories: { architecture: "Architecture" } } }),
        }),
      }),
    });
    await endpoints.saveProduct({ data: { ...product, publicationDate: "2026-11-22" } });
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ coming_soon: true, publication_date: "2026-11-22" }),
    );
    await endpoints.saveProduct({ data: { ...product, publicationDate: "" } });
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ publication_date: null }));
  });
  it("rejects impossible publication dates before any database write", async () => {
    await expect(
      endpoints.saveProduct({ data: { ...product, publicationDate: "2026-02-30" } }),
    ).rejects.toThrow();
    expectNoDataAccess();
  });
  it("lists nested gallery images and signs private paths without modifying storage", async () => {
    mocks.list
      .mockResolvedValueOnce({ data: [{ name: "products", id: null }], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            name: "fixture.png",
            id: "image-fixture",
            metadata: { size: 4096 },
            created_at: "2026-10-17",
          },
          { name: "notes.txt", id: "text-fixture" },
        ],
        error: null,
      });
    mocks.signs.mockResolvedValue({
      data: [{ path: "products/fixture.png", signedUrl: "https://example.com/private-fixture" }],
      error: null,
    });
    expect(await endpoints.listAdminImages()).toEqual([
      {
        path: "products/fixture.png",
        name: "fixture.png",
        folder: "products",
        bytes: 4096,
        createdAt: "2026-10-17",
        width: null,
        height: null,
        url: "https://example.com/private-fixture",
      },
    ]);
    expect(mocks.signs).toHaveBeenCalledWith(["products/fixture.png"], 3600);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  });
  it("does not disguise storage errors as an empty gallery", async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(endpoints.listAdminImages()).rejects.toThrow();
    expect(mocks.signs).not.toHaveBeenCalled();
  });
  it("reads activity using the caller's client with server-side paging", async () => {
    const rows = [
      {
        id: "log-fixture",
        actor_email: "admin@example.com",
        action: "settings.save",
        target: "",
        created_at: "2026-10-17T00:00:00Z",
      },
    ];
    mocks.range.mockResolvedValue({ data: rows, error: null });
    expect(await endpoints.listAdminActivity()).toEqual(rows);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("admin_activity");
    expect(mocks.range).toHaveBeenCalledExactlyOnceWith(0, 199);
    await endpoints.listAdminActivity({ data: { limit: 20, offset: 40 } });
    expect(mocks.range).toHaveBeenLastCalledWith(40, 59);
    expect(mocks.privilegedFrom).not.toHaveBeenCalled();
  });
  it("does not disguise an activity read failure as an empty log", async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(endpoints.listAdminActivity()).rejects.toThrow();
  });
  it("lists request photos without creating any reusable signed link", async () => {
    mocks.limit.mockResolvedValue({
      data: [
        {
          id: "request-fixture",
          attachments: [{ path: "request-fixture/image.png", name: "image.png", size: 20 }],
        },
      ],
      error: null,
    });
    const rows = await endpoints.listRequests();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(rows[0]?.attachments[0]?.url).toBe("");
  });

  const photo = { id: "725e1a8f-01cb-4cdd-a274-72a373480b31", path: "r/image.png" };
  const withRow = (attachments: unknown[]) => {
    mocks.select.mockReturnValue({
      eq: () => ({ maybeSingle: async () => ({ data: { attachments }, error: null }) }),
    });
  };

  it("returns a current admin the photo bytes, re-checking the admin role on every view", async () => {
    withRow([{ path: photo.path, name: "image.png", size: 3 }]);
    mocks.download.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    });
    const result = await endpoints.getRequestAttachment({ data: photo });
    expect(result).toEqual({ ok: true, src: "data:image/png;base64,AQID" });
    expect(mocks.role).toHaveBeenCalledTimes(1);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("refuses a removed admin without reading storage", async () => {
    withRow([{ path: photo.path, name: "image.png", size: 3 }]);
    mocks.role.mockResolvedValue({ data: false, error: null });
    await expect(endpoints.getRequestAttachment({ data: photo })).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("refuses a path that is not recorded on the request", async () => {
    withRow([{ path: "other/image.png", name: "x.png", size: 3 }]);
    expect(await endpoints.getRequestAttachment({ data: photo })).toEqual({ ok: false });
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

describe("Server-side admin image validation", () => {
  it.each(["image/svg+xml", "text/html", "application/octet-stream"])(
    "refuses unsupported %s without storage access",
    async (type) => {
      expect((await endpoints.uploadAdminImage({ data: uploadData(undefined, type) })).ok).toBe(
        false,
      );
      expect(mocks.storage).not.toHaveBeenCalled();
    },
  );
  it("rejects a spoofed PNG before uploading", async () => {
    expect((await endpoints.uploadAdminImage({ data: uploadData() })).ok).toBe(false);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("rejects empty images before uploading", async () => {
    expect((await endpoints.uploadAdminImage({ data: uploadData(new Uint8Array()) })).ok).toBe(
      false,
    );
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("rejects images exceeding 4 MiB before uploading", async () => {
    expect(
      (await endpoints.uploadAdminImage({ data: uploadData(new Uint8Array(4 * 1024 * 1024 + 1)) }))
        .ok,
    ).toBe(false);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("rejects arbitrary destination folders", async () => {
    await expect(
      endpoints.uploadAdminImage({ data: uploadData(undefined, "image/png", "../requests") }),
    ).rejects.toThrow();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});

describe("Settings and password rules", () => {
  it("rejects activity pages above 200 rows", async () => {
    await expect(endpoints.listAdminActivity({ data: { limit: 201 } })).rejects.toThrow();
  });
  it("rejects new passwords shorter than 10 characters", () => {
    expect(
      endpoints.passwordChangeSchema.safeParse({ currentPassword: "x", password: "123456789" })
        .success,
    ).toBe(false);
  });
  it("rejects new passwords longer than 200 characters", () => {
    expect(
      endpoints.passwordChangeSchema.safeParse({ currentPassword: "x", password: "a".repeat(201) })
        .success,
    ).toBe(false);
  });
  it("requires the current password", () => {
    expect(endpoints.passwordChangeSchema.safeParse({ password: "long-enough-1" }).success).toBe(
      false,
    );
  });
  it("refuses a new password equal to the account email", async () => {
    mocks.privilegedRpc.mockResolvedValue({ data: true, error: null });
    mocks.user.mockResolvedValue({
      data: { user: { id: "admin-fixture", email: "admin@example.com" } },
      error: null,
    });
    const result = await endpoints.changeAdminPassword({
      data: { currentPassword: "old-password-1", password: "Admin@Example.com" },
    });
    expect(result.ok).toBe(false);
  });
  it("stops password attempts once the rate limit is used up", async () => {
    mocks.privilegedRpc.mockResolvedValue({ data: false, error: null });
    const result = await endpoints.changeAdminPassword({
      data: { currentPassword: "old-password-1", password: "new-password-12" },
    });
    expect(result).toEqual({ ok: false, message: "errPasswordRate" });
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("feature flags accept exactly the known feature keys", () => {
    const all = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
    expect(endpoints.featureFlagsSchema.safeParse(all).success).toBe(true);
    expect(endpoints.featureFlagsSchema.safeParse({ assistant: true }).success).toBe(false);
    expect(endpoints.featureFlagsSchema.parse({ ...all, extra: true })).toEqual(all);
  });
  it("affiliate delete uses the same id rule as save", async () => {
    await expect(endpoints.deleteAffiliate({ data: { id: "Bad Id!" } })).rejects.toThrow();
  });
  it("accepts the affiliates upload folder but no others", async () => {
    expect((endpoints.ADMIN_UPLOAD_FOLDERS as readonly string[]).includes("affiliates")).toBe(true);
  });
});
