import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localizeBeneficiaryDetails,
  normalizeBeneficiaryDetails,
  beneficiaryDetailsSchema,
  isScreenshotUrl,
} from "@/lib/beneficiary-metadata";
import { composeNotice, statusNeedsNotice } from "@/lib/customer-notify.server";
import { funnelSteps } from "@/lib/site-visits.shared";
import {
  testimonialsForProduct,
  type Testimonial,
} from "@/lib/testimonials.shared";
import { waitlistCountText } from "@/components/product-waitlist";
import {
  guestName,
  validateRegistration,
} from "@/lib/assistant-chat.functions";

describe("product screenshots", () => {
  it("keeps https links and library paths, drops everything else, max 6", () => {
    expect(isScreenshotUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isScreenshotUrl("products/radar-1.png")).toBe(true);
    expect(isScreenshotUrl("http://example.com/a.png")).toBe(false);
    expect(isScreenshotUrl("javascript:alert(1)")).toBe(false);
    expect(isScreenshotUrl("products/../secret.png")).toBe(false);
    const shots = Array.from({ length: 9 }, (_, i) => ({
      url: `products/s${i}.png`,
      caption: { ar: "", en: `S${i}` },
    }));
    const details = normalizeBeneficiaryDetails({
      screenshots: [{ url: "javascript:x", caption: {} }, ...shots],
    });
    expect(details.screenshots).toHaveLength(6);
    expect(details.screenshots[0]!.url).toBe("products/s0.png");
  });

  it("shows only displayable links, preferring the signed src", () => {
    const local = localizeBeneficiaryDetails(
      {
        screenshots: [
          {
            url: "products/a.png",
            caption: { ar: "أ", en: "A" },
            src: "https://signed.example/a",
          },
          { url: "products/b.png", caption: { ar: "", en: "B" } },
          {
            url: "https://cdn.example.com/c.png",
            caption: { ar: "ج", en: "" },
          },
        ],
      },
      "en",
    );
    expect(local.screenshots).toEqual([
      { url: "https://signed.example/a", caption: "A" },
      { url: "https://cdn.example.com/c.png", caption: "ج" },
    ]);
  });

  it("never stores the signed src when saving", () => {
    const parsed = beneficiaryDetailsSchema.parse({
      ...normalizeBeneficiaryDetails({}),
      screenshots: [
        {
          url: "products/a.png",
          caption: { ar: "", en: "" },
          src: "https://signed/x",
        },
      ],
    });
    expect(parsed.screenshots[0]).toEqual({
      url: "products/a.png",
      caption: { ar: "", en: "" },
    });
  });
});

describe("customer email notices", () => {
  it("only emails meaningful status changes", () => {
    expect(statusNeedsNotice("in_progress")).toBe(true);
    expect(statusNeedsNotice("resolved")).toBe(true);
    expect(statusNeedsNotice("rejected")).toBe(true);
    expect(statusNeedsNotice("new")).toBe(false);
  });
  it("writes the reply notice in the customer's language with a tracking link", () => {
    const ar = composeNotice(
      { kind: "reply", requestId: "r", replyId: "x", body: "شكرًا لك" },
      { email: "a@b.co", name: "خالد", need: "نحتاج أداة" },
      "https://www.e20e.tools",
    );
    expect(ar.ar).toBe(true);
    expect(ar.text).toContain("مرحبًا خالد،");
    expect(ar.text).toContain("https://www.e20e.tools/my-requests");
    const en = composeNotice(
      { kind: "status", requestId: "r", status: "resolved" },
      { email: "a@b.co", name: "", need: "We need a tool" },
      "https://x.test",
    );
    expect(en.ar).toBe(false);
    expect(en.text.startsWith("Hello,")).toBe(true);
  });
  it("cuts long replies in the email preview", () => {
    const n = composeNotice(
      { kind: "reply", requestId: "r", replyId: "x", body: "a".repeat(900) },
      { email: "a@b.co", name: "Sam", need: "x" },
      "https://x.test",
    );
    expect(n.text).toContain("a".repeat(600) + "…");
    expect(n.text).not.toContain("a".repeat(601));
  });
});

describe("notifyCustomer without email set up", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/integrations/supabase/client.server");
  });
  it("logs a skipped notice and never calls the mail API", async () => {
    const inserted: unknown[] = [];
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { email: "a@b.co", name: "A", need: "x" },
              }),
            }),
          }),
          insert: async (row: unknown) => {
            inserted.push({ table, row });
            return {};
          },
        }),
      },
    }));
    delete process.env["RESEND_API_KEY"];
    const { notifyCustomer } = await import("@/lib/customer-notify.server");
    const fetcher = vi.fn();
    expect(
      await notifyCustomer(
        { kind: "status", requestId: "r1", status: "resolved" },
        fetcher,
      ),
    ).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      expect.objectContaining({
        table: "admin_activity",
        row: expect.objectContaining({ action: "customer.email_skipped" }),
      }),
    ]);
  });
});

describe("Archy without registration", () => {
  it("accepts a visitor with no name or email and names them by language", () => {
    const parsed = validateRegistration({
      name: "",
      email: "",
      question: "",
      language: "ar",
      token: "t",
      answer: "4",
    });
    expect(parsed.name).toBe("");
    expect(parsed.email).toBe("");
    expect(guestName("ar")).toBe("زائر");
    expect(guestName("en")).toBe("Visitor");
  });
});

describe("waitlist, funnel and product testimonials", () => {
  it("phrases the waiting count with Arabic number agreement", () => {
    expect(waitlistCountText(0, true)).toBe("كن أول من ينتظرها");
    expect(waitlistCountText(1, true)).toBe("شخص واحد بانتظارها");
    expect(waitlistCountText(2, true)).toBe("شخصان بانتظارها");
    expect(waitlistCountText(5, true)).toBe("5 أشخاص بانتظارها");
    expect(waitlistCountText(14, true)).toBe("14 شخصًا بانتظارها");
    expect(waitlistCountText(1, false)).toBe("1 person is waiting");
    expect(waitlistCountText(3, false)).toBe("3 people are waiting");
  });

  it("computes step conversion against the previous and first stage", () => {
    const steps = funnelSteps([
      { stage: "visitors", count: 200 },
      { stage: "productViewers", count: 50 },
      { stage: "chats", count: 5 },
      { stage: "requests", count: 0 },
    ]);
    expect(steps.map((s) => s.ofPrevious)).toEqual([null, 25, 10, 0]);
    expect(steps.map((s) => s.ofFirst)).toEqual([null, 25, 3, 0]);
    expect(
      funnelSteps([
        { stage: "visitors", count: 0 },
        { stage: "productViewers", count: 0 },
      ])[1]!.ofPrevious,
    ).toBeNull();
  });

  it("matches testimonials that name the product as a whole word", () => {
    const base: Testimonial = {
      id: "1",
      name: "A",
      roleAr: "",
      roleEn: "",
      organizationAr: "",
      organizationEn: "",
      quoteAr: "",
      quoteEn: "",
      image: "",
      imagePath: "",
      sortOrder: 0,
      published: true,
    };
    const list = [
      { ...base, id: "a", quoteEn: "Tech Radar saved us weeks." },
      { ...base, id: "b", quoteAr: "استخدمنا Tech Radar في التقييم" },
      { ...base, id: "c", quoteEn: "Great TechRadarX clone" },
      { ...base, id: "d", quoteEn: "Tech Radar again", published: false },
      { ...base, id: "e", quoteEn: "The radar tool helped" },
    ];
    expect(
      testimonialsForProduct(list, { id: "radar", name: "Tech Radar" }).map(
        (t) => t.id,
      ),
    ).toEqual(["a", "b", "e"]);
  });
});
