import { describe, expect, it } from "vitest";
import {
  compactCustomization,
  consultantContact,
  emptyCustomization,
  isEmptyCustomization,
  normalizeThemeCustomizations,
  normalizeWhatsapp,
  themeCustomizationSchema,
  whatsappUrl,
} from "@/lib/theme-customization";
import {
  testimonialInputSchema,
  testimonialText,
  testimonialsSeo,
  type Testimonial,
} from "@/lib/testimonials.shared";
import { isNavigationUrl } from "@/lib/navigation.shared";
import { resolveAdminLocation } from "@/lib/admin-sections";

describe("consultant contact per design", () => {
  it("uses the design's own team email and WhatsApp when saved", () => {
    const entry = {
      ...emptyCustomization(),
      consultants: { email: "tb@e20e.tools", whatsapp: "966500000000" },
    };
    expect(consultantContact(entry, "ea@20e.tools")).toEqual({
      email: "tb@e20e.tools",
      whatsapp: "966500000000",
      own: true,
    });
  });

  it("falls back to the public email when the design has no team contact", () => {
    expect(consultantContact(emptyCustomization(), "ea@20e.tools")).toEqual({
      email: "ea@20e.tools",
      whatsapp: "",
      own: false,
    });
  });

  it("a design with only WhatsApp shows no email", () => {
    const entry = {
      ...emptyCustomization(),
      consultants: { whatsapp: "966500000000" },
    };
    expect(consultantContact(entry, "ea@20e.tools").email).toBe("");
  });

  it("stores WhatsApp numbers as international digits and builds a wa.me link", () => {
    expect(normalizeWhatsapp("+966 50 000 0000")).toBe("966500000000");
    expect(normalizeWhatsapp("00966500000000")).toBe("966500000000");
    expect(whatsappUrl("966500000000")).toBe("https://wa.me/966500000000");
    expect(whatsappUrl("0500000000")).toBe("");
    expect(whatsappUrl("123")).toBe("");
  });

  it("rejects an invalid email or number when saving", () => {
    const base = { ...emptyCustomization() };
    expect(
      themeCustomizationSchema.safeParse({
        ...base,
        consultants: { email: "not-an-email" },
      }).success,
    ).toBe(false);
    expect(
      themeCustomizationSchema.safeParse({
        ...base,
        consultants: { whatsapp: "+966500" },
      }).success,
    ).toBe(false);
    expect(
      themeCustomizationSchema.safeParse({
        ...base,
        consultants: { email: "a@b.co", whatsapp: "966500000000" },
      }).success,
    ).toBe(true);
  });

  it("empty contact fields are dropped so the design counts as not customised", () => {
    const value = {
      ...emptyCustomization(),
      consultants: { email: "", whatsapp: "" },
    };
    expect(compactCustomization(value).consultants).toBeUndefined();
    expect(isEmptyCustomization(value)).toBe(true);
    const saved = normalizeThemeCustomizations({
      "transformation-board": { consultants: { email: "tb@e20e.tools" } },
    });
    expect(saved["transformation-board"]?.consultants).toEqual({
      email: "tb@e20e.tools",
    });
  });
});

describe("customer testimonials", () => {
  const valid = {
    name: "Sara",
    roleAr: "",
    roleEn: "",
    organizationAr: "",
    organizationEn: "",
    quoteAr: "",
    quoteEn: "Great tools.",
    imagePath: "",
    sortOrder: 1,
    published: true,
  };

  it("needs a name and text in at least one language", () => {
    expect(testimonialInputSchema.safeParse(valid).success).toBe(true);
    expect(
      testimonialInputSchema.safeParse({ ...valid, name: " " }).success,
    ).toBe(false);
    expect(
      testimonialInputSchema.safeParse({ ...valid, quoteEn: "" }).success,
    ).toBe(false);
  });

  it("only accepts photos from the site's picture library", () => {
    expect(
      testimonialInputSchema.safeParse({
        ...valid,
        imagePath: "branding/a.jpg",
      }).success,
    ).toBe(true);
    expect(
      testimonialInputSchema.safeParse({
        ...valid,
        imagePath: "https://evil.example/a.jpg",
      }).success,
    ).toBe(false);
  });

  it("shows Arabic text when the English translation is missing", () => {
    const item = {
      ...valid,
      quoteAr: "أدوات ممتازة",
      quoteEn: "",
      id: "x",
      image: "",
    } as Testimonial;
    expect(testimonialText(item, "en").quote).toBe("أدوات ممتازة");
  });
});

describe("new pages are reachable", () => {
  it("menu links may point at the testimonials and Enterprise Services pages (old consultants link kept)", () => {
    expect(isNavigationUrl("/testimonials")).toBe(true);
    expect(isNavigationUrl("/consultants")).toBe(true);
    expect(isNavigationUrl("/enterprise-services")).toBe(true);
  });

  it("testimonials open from admin Settings", () => {
    expect(resolveAdminLocation("settings", "testimonials")).toEqual({
      section: "settings",
      tab: "testimonials",
    });
  });
});

describe("testimonials page and search engines", () => {
  const item = {
    id: "1",
    name: "Sara Ali",
    roleAr: "",
    roleEn: "Chief Architect",
    organizationAr: "",
    organizationEn: "Acme",
    quoteAr: "",
    quoteEn: "The radar saved us weeks.",
    image: "",
    imagePath: "",
    sortOrder: 1,
    published: true,
  };

  it("stays out of search results while no testimonial is published", () => {
    expect(testimonialsSeo([])).toEqual({ noindex: true, jsonLd: null });
    expect(testimonialsSeo([{ ...item, published: false }]).noindex).toBe(true);
  });

  it("becomes indexable with structured quotes once a real testimonial is published", () => {
    const seo = testimonialsSeo([item]);
    expect(seo.noindex).toBe(false);
    const json = JSON.stringify(seo.jsonLd);
    expect(json).toContain('"url":"https://www.e20e.tools/testimonials"');
    expect(json).toContain('"text":"The radar saved us weeks."');
    expect(json).toContain('"name":"Sara Ali"');
    expect(json).toContain('"jobTitle":"Chief Architect"');
    expect(json).toContain('"numberOfItems":1');
  });
});
