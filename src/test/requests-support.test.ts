// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  allowed: true,
  consume: vi.fn(),
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  notify: vi.fn(),
  verifyVisitor: vi.fn(),
  openChatFor: vi.fn(),
  tourSupport: vi.fn(),
  journey: vi.fn(),
  uploads: [] as { path: string; bytes: Uint8Array; contentType: string }[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: (value: unknown) => unknown) => {
        validate = validator;
        return builder;
      },
      handler:
        (handler: (args: unknown) => unknown) =>
        async (args?: { data?: unknown }) =>
          handler({ data: validate(args?.data) }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: mocks.headers }),
}));
vi.mock("@/lib/rate-limit.server", () => ({
  clientIp: () => "203.0.113.1",
  consumeLimits: (rules: unknown) => {
    mocks.consume(rules);
    return Promise.resolve(mocks.allowed);
  },
  noteBudgetUsage: async () => undefined,
}));
vi.mock("@/lib/recommend.server", () => ({
  liveCatalog: async () => [{ id: "itfm" }],
}));
vi.mock("@/lib/contact-notify.server", () => ({
  notifyContactSubmission: mocks.notify,
}));
vi.mock("@/lib/live-chat.server", () => ({
  verifyVisitor: mocks.verifyVisitor,
  openChatFor: mocks.openChatFor,
}));
vi.mock("@/lib/journey.server", () => ({ recordJourney: mocks.journey }));
vi.mock("@/lib/archy-tour-visits.server", () => ({
  recordTourSupport: mocks.tourSupport,
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const table = (name: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 0, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () =>
        Promise.resolve({
          data: {
            id: "725e1a8f-01cb-4cdd-a274-72a373480b31",
            created_at: "2026-11-03T00:00:00Z",
          },
          error: null,
        }),
      insert: (row: Record<string, unknown>) => {
        mocks.inserts.push({ table: name, row });
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  };
  return {
    supabaseAdmin: {
      from: table,
      storage: {
        from: () => ({
          upload: async (
            path: string,
            bytes: Uint8Array,
            options: { contentType: string },
          ) => {
            mocks.uploads.push({
              path,
              bytes,
              contentType: options.contentType,
            });
            return { error: null };
          },
          remove: async () => ({}),
        }),
      },
    },
  };
});

import { submitRequest } from "@/lib/requests.functions";
import { submitSupportOffer } from "@/lib/support.functions";
import { requestSchema, supportSchema } from "@/lib/requests.shared";

const id = "725e1a8f-01cb-4cdd-a274-72a373480b31";
const longText =
  "We need a way to map current technologies across the organisation.";
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries({
    requestId: id,
    name: "Khaled",
    email: "Ea@Example.com",
    need: longText,
    phone: "+966500000000",
    website: "",
    ...values,
  }).forEach(([k, v]) => data.set(k, v));
  return data;
}

beforeEach(() => {
  mocks.headers = new Headers();
  mocks.allowed = true;
  mocks.inserts = [];
  mocks.consume.mockReset();
  mocks.notify.mockReset();
  mocks.tourSupport.mockReset();
  mocks.journey.mockReset().mockResolvedValue(true);
  mocks.uploads = [];
  mocks.verifyVisitor.mockReset().mockResolvedValue({
    id: "guest-current",
    name: "Khaled",
    email: "ea@example.com",
  });
  mocks.openChatFor.mockReset().mockResolvedValue({
    id: "f8bcd11c-a841-40d4-a501-13b8f28d74ca",
    status: "ai",
  });
});

describe("unified request validation", () => {
  const noPhone = {
    requestId: id,
    name: "Khaled",
    email: "ea@example.com",
    need: longText,
  };
  const base = { ...noPhone, phone: "+966500000000" };
  it("requires phone for support but keeps it optional for shorter new, feature and general forms", () => {
    for (const type of ["new", "feature", "general"]) {
      expect(
        requestSchema.safeParse({ ...noPhone, type, productId: "itfm" })
          .success,
      ).toBe(true);
    }
    expect(
      requestSchema.safeParse({
        ...noPhone,
        type: "support",
        productId: "itfm",
        urgency: "urgent",
      }).success,
    ).toBe(false);
  });
  it("accepts a general inquiry without product", () => {
    expect(requestSchema.safeParse({ ...base, type: "general" }).success).toBe(
      true,
    );
  });
  it("requires a product for feature and support requests", () => {
    expect(requestSchema.safeParse({ ...base, type: "feature" }).success).toBe(
      false,
    );
    expect(
      requestSchema.safeParse({ ...base, type: "feature", productId: "itfm" })
        .success,
    ).toBe(true);
  });
  it("requires phone and urgency only for support", () => {
    const support = { ...noPhone, type: "support", productId: "itfm" };
    expect(
      requestSchema.safeParse({ ...support, urgency: "urgent" }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...support, phone: "+966500000000" }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({
        ...support,
        phone: "+966500000000",
        urgency: "urgent",
      }).success,
    ).toBe(true);
    expect(
      requestSchema.safeParse({
        ...support,
        phone: "+966500000000",
        urgency: "asap",
      }).success,
    ).toBe(false);
  });
  it("rejects short messages and unknown types", () => {
    expect(
      requestSchema.safeParse({ ...base, type: "general", need: "short" })
        .success,
    ).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "other" }).success).toBe(
      false,
    );
  });
});

describe("submitRequest", () => {
  it("records post-tour support only after a successful stored receipt", async () => {
    const result = await submitRequest({
      data: form({
        type: "support",
        productId: "itfm",
        urgency: "urgent",
        tourToken: "signed-tour",
      }),
    });
    expect(result.ok).toBe(true);
    expect(mocks.tourSupport).toHaveBeenCalledWith(
      expect.anything(),
      "signed-tour",
      id,
    );
    expect(mocks.inserts[0]?.table).toBe("suggestion_requests");
  });
  it("does not record a rejected support request as a post-tour conversion", async () => {
    mocks.allowed = false;
    expect(
      (
        await submitRequest({
          data: form({
            type: "support",
            productId: "itfm",
            urgency: "urgent",
            tourToken: "signed-tour",
          }),
        })
      ).ok,
    ).toBe(false);
    expect(mocks.tourSupport).not.toHaveBeenCalled();
  });
  it("links a chat-origin support request to the signed visitor's current conversation", async () => {
    const result = await submitRequest({
      data: form({
        type: "support",
        productId: "itfm",
        urgency: "urgent",
        fromChat: "1",
        chatAccess: "signed-current-guest",
      }),
    });
    expect(result.ok).toBe(true);
    expect(mocks.verifyVisitor).toHaveBeenCalledWith(
      { supabase: null, userId: "" },
      "signed-current-guest",
    );
    expect(mocks.openChatFor).toHaveBeenCalledWith(expect.anything(), {
      id: "guest-current",
      name: "Khaled",
      email: "ea@example.com",
      language: "en",
    });
    expect(mocks.inserts[0]?.row["details"]).toMatchObject({
      chatId: "f8bcd11c-a841-40d4-a501-13b8f28d74ca",
    });
  });
  it("rejects chat-origin support when visitor access has expired instead of saving an unlinked request", async () => {
    mocks.verifyVisitor.mockResolvedValue(null);
    expect(
      await submitRequest({
        data: form({
          type: "support",
          productId: "itfm",
          urgency: "urgent",
          fromChat: "1",
        }),
      }),
    ).toEqual({ ok: false, message: "rqErrRejected" });
    expect(mocks.inserts).toHaveLength(0);
  });
  it("never links another email's chat using a typed email", async () => {
    mocks.verifyVisitor.mockResolvedValue({
      id: "other-guest",
      name: "Other",
      email: "other@example.com",
    });
    expect(
      (
        await submitRequest({
          data: form({
            type: "support",
            productId: "itfm",
            urgency: "urgent",
            fromChat: "1",
            chatAccess: "other-token",
          }),
        })
      ).ok,
    ).toBe(false);
    expect(mocks.openChatFor).not.toHaveBeenCalled();
    expect(mocks.inserts).toHaveLength(0);
  });
  it("saves a request typed with a different email than the chat session, without the guest tracking link", async () => {
    const result = await submitRequest({
      data: form({
        type: "general",
        email: "work@company.example",
        visitorAccess: "signed-current-guest",
      }),
    });
    expect(result).toMatchObject({ ok: true, tracking: "none" });
    expect(
      mocks.inserts.find((i) => i.table === "suggestion_requests")?.row[
        "email"
      ],
    ).toBe("work@company.example");
    expect(mocks.inserts.some((i) => i.table === "request_identities")).toBe(
      false,
    );
  });
  it("tells chat-opened requests to use the chat email instead of a generic rejection", async () => {
    const result = await submitRequest({
      data: form({
        type: "support",
        productId: "itfm",
        urgency: "urgent",
        fromChat: "1",
        chatAccess: "signed-current-guest",
        email: "work@company.example",
      }),
    });
    expect(result).toEqual({ ok: false, message: "rqErrChatEmail" });
    expect(mocks.inserts).toHaveLength(0);
  });
  it("stores a support request with its type, product and urgency and returns the stored receipt", async () => {
    const result = await submitRequest({
      data: form({
        type: "support",
        productId: "itfm",
        phone: "+966500000000",
        urgency: "urgent",
        impact: "dropped",
      }),
    });
    expect(result).toEqual({
      ok: true,
      id,
      createdAt: "2026-11-03T00:00:00Z",
      tracking: "none",
    });
    const row = mocks.inserts[0]?.row;
    expect(mocks.inserts[0]?.table).toBe("suggestion_requests");
    expect(row).toMatchObject({
      request_type: "support",
      product_id: "itfm",
      urgency: "urgent",
      impact: "",
      email: "ea@example.com",
    });
    expect(mocks.notify).toHaveBeenCalledWith(id, "request.support");
  });
  it("counts a confirmed receipt once as an anonymous event unless the visitor opted out", async () => {
    const general = { type: "general", language: "ar" };
    await submitRequest({ data: form(general) });
    expect(mocks.journey).toHaveBeenCalledWith("request_completed", "ar", id);
    mocks.journey.mockClear();
    await submitRequest({ data: form({ ...general, metrics: "off" }) });
    expect(mocks.journey).not.toHaveBeenCalled();
    mocks.headers = new Headers({ "sec-gpc": "1" });
    const gpc = await submitRequest({ data: form(general) });
    expect(gpc.ok).toBe(true);
    expect(mocks.journey).not.toHaveBeenCalled();
    mocks.headers = new Headers({ dnt: "1" });
    await submitRequest({ data: form(general) });
    expect(mocks.journey).not.toHaveBeenCalled();
  });
  it("uploads WebP bytes after removing EXIF/XMP metadata", async () => {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x0c;
    vp8x.set([63, 0, 0, 31, 0, 0], 4);
    const chunk = (name: string, payload: Uint8Array) => {
      const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
      bytes.set(new TextEncoder().encode(name));
      new DataView(bytes.buffer).setUint32(4, payload.length, true);
      bytes.set(payload, 8);
      return bytes;
    };
    const chunks = [
      chunk("VP8X", vp8x),
      chunk("EXIF", new TextEncoder().encode("GPS:24.7136,46.6753")),
      chunk("XMP ", new TextEncoder().encode("<xmp>Riyadh</xmp>")),
      chunk("VP8 ", new Uint8Array([1, 2, 3, 4])),
    ];
    const bytes = new Uint8Array(
      12 + chunks.reduce((sum, item) => sum + item.length, 0),
    );
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    let offset = 12;
    for (const item of chunks) {
      bytes.set(item, offset);
      offset += item.length;
    }
    const data = form({ type: "new" });
    data.set(
      "images",
      new File([bytes], "location.webp", { type: "image/webp" }),
    );

    const result = await submitRequest({ data });
    expect(result.ok).toBe(true);
    expect(mocks.uploads).toHaveLength(1);
    const uploaded = mocks.uploads[0]!;
    const text = new TextDecoder().decode(uploaded.bytes);
    expect(uploaded.contentType).toBe("image/webp");
    expect(text).not.toContain("EXIF");
    expect(text).not.toContain("XMP");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("Riyadh");
    expect(text).toContain("VP8 ");
    expect(uploaded.bytes[20]).toBe(0);
  });
  it("drops the honeypot submission without storing", async () => {
    const result = await submitRequest({
      data: form({ type: "general", website: "spam" }),
    });
    expect(result.ok).toBe(false);
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("rejects cross-site posts but allows a missing Sec-Fetch-Site header", async () => {
    mocks.headers = new Headers({ "sec-fetch-site": "cross-site" });
    expect((await submitRequest({ data: form({ type: "general" }) })).ok).toBe(
      false,
    );
    mocks.headers = new Headers();
    expect((await submitRequest({ data: form({ type: "general" }) })).ok).toBe(
      true,
    );
  });
  it("stops when the durable rate limit is exhausted", async () => {
    mocks.allowed = false;
    expect(await submitRequest({ data: form({ type: "general" }) })).toEqual({
      ok: false,
      message: "rqErrBusy",
    });
    expect(mocks.inserts).toHaveLength(0);
  });
  it("refuses a product that is not in the live catalog", async () => {
    expect(
      await submitRequest({
        data: form({ type: "feature", productId: "made-up" }),
      }),
    ).toEqual({
      ok: false,
      message: "rqErrProduct",
    });
  });
  it("refuses a feature request without a product before any database work", async () => {
    await expect(
      submitRequest({ data: form({ type: "feature" }) }),
    ).rejects.toThrow("rqErrProduct");
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});

describe("enterprise service requests", () => {
  const service = {
    requestId: id,
    type: "service",
    name: "Khaled",
    email: "ea@example.com",
    phone: "+966500000000",
    company: "Ministry",
    need: longText,
    services: ["training"],
  };
  it("requires the organisation name", () => {
    expect(requestSchema.safeParse(service).success).toBe(true);
    expect(requestSchema.safeParse({ ...service, company: "" }).success).toBe(
      false,
    );
  });
  it("requires at least one service", () => {
    expect(requestSchema.safeParse({ ...service, services: [] }).success).toBe(
      false,
    );
    expect(
      requestSchema.safeParse({ ...service, services: ["consulting"] }).success,
    ).toBe(false);
  });
  it("stores the chosen services, tools, team size and start as a service request", async () => {
    const result = await submitRequest({
      data: form({
        type: "service",
        company: "Ministry",
        services: JSON.stringify(["implementation", "training", "training"]),
        tools: JSON.stringify(["itfm"]),
        teamSize: "11-50",
        timeline: "1-3m",
      }),
    });
    expect(result.ok).toBe(true);
    expect(mocks.inserts[0]?.row).toMatchObject({
      request_type: "service",
      company: "Ministry",
      product_id: null,
      attachments: [],
      details: {
        services: ["implementation", "training"],
        tools: ["itfm"],
        teamSize: "11-50",
        timeline: "1-3m",
      },
    });
    expect(mocks.notify).toHaveBeenCalledWith(id, "request.service");
  });
  it("refuses a tool that is not in the live catalog", async () => {
    const result = await submitRequest({
      data: form({
        type: "service",
        company: "Ministry",
        services: JSON.stringify(["support"]),
        tools: JSON.stringify(["made-up"]),
      }),
    });
    expect(result).toEqual({ ok: false, message: "rqErrProduct" });
    expect(mocks.inserts).toHaveLength(0);
  });
});

describe("support offers", () => {
  const partnership = {
    requestId: id,
    offerType: "partnership",
    name: "Sara",
    email: "sara@example.org",
    organization: "Org",
    orgType: "academic",
    area: "research",
  };
  it("requires organisation fields for partnerships", () => {
    expect(supportSchema.safeParse(partnership).success).toBe(true);
    expect(
      supportSchema.safeParse({ ...partnership, organization: "" }).success,
    ).toBe(false);
    expect(
      supportSchema.safeParse({ ...partnership, orgType: "club" }).success,
    ).toBe(false);
  });
  it("requires at least one skill and https-only links for contributions", () => {
    const contribution = {
      requestId: id,
      offerType: "contribution",
      name: "Ali",
      email: "ali@example.com",
      skills: ["frontend"],
      hours: "5-10",
      links: ["https://github.com/ali"],
    };
    expect(supportSchema.safeParse(contribution).success).toBe(true);
    expect(
      supportSchema.safeParse({ ...contribution, skills: [] }).success,
    ).toBe(false);
    expect(
      supportSchema.safeParse({
        ...contribution,
        links: ["http://github.com/ali"],
      }).success,
    ).toBe(false);
    expect(
      supportSchema.safeParse({
        ...contribution,
        links: ["javascript:alert(1)"],
      }).success,
    ).toBe(false);
  });
  it("financial offers carry no payment fields and need a support type", () => {
    const financial = {
      requestId: id,
      offerType: "financial",
      name: "Co",
      email: "co@example.com",
      kind: "once",
    };
    expect(supportSchema.safeParse(financial).success).toBe(true);
    expect(supportSchema.safeParse({ ...financial, kind: "" }).success).toBe(
      false,
    );
  });
  it("stores an offer in support_offers with typed details and returns the receipt", async () => {
    const result = await submitSupportOffer({
      data: { ...partnership, website: "" },
    });
    expect(result.ok).toBe(true);
    expect(mocks.inserts[0]?.table).toBe("support_offers");
    expect(mocks.inserts[0]?.row).toMatchObject({
      offer_type: "partnership",
      organization: "Org",
      details: { orgType: "academic", area: "research" },
    });
  });
  it("drops honeypot and rate-limited offers without storing", async () => {
    expect(
      (await submitSupportOffer({ data: { ...partnership, website: "bot" } }))
        .ok,
    ).toBe(false);
    mocks.allowed = false;
    expect(await submitSupportOffer({ data: partnership })).toEqual({
      ok: false,
      message: "rqErrBusy",
    });
    expect(mocks.inserts).toHaveLength(0);
  });
});

describe("request limits tied to an unverified email", () => {
  it("keys the per-email daily limit by IP and email together, keeping IP and site-wide limits", async () => {
    const result = await submitRequest({ data: form({ type: "general" }) });
    expect(result.ok).toBe(true);
    const rules = mocks.consume.mock.calls.flatMap(
      ([batch]) =>
        batch as { bucket: string; subject: string; limit: number }[],
    );
    expect(rules.find((r) => r.bucket === "request:email-day")?.subject).toBe(
      "203.0.113.1|ea@example.com",
    );
    expect(rules.find((r) => r.bucket === "request:global-day")).toMatchObject({
      subject: "all",
      limit: 300,
    });
  });
});
