/**
 * Customer testimonials: browser-safe types and validation shared by the
 * public page, the admin editor and the server functions.
 */
import { z } from "zod";
import { pick, type Language } from "./language-core";

export type Testimonial = {
  id: string;
  name: string;
  roleAr: string;
  roleEn: string;
  organizationAr: string;
  organizationEn: string;
  quoteAr: string;
  quoteEn: string;
  /** Signed URL for display ("" when there is no photo). */
  image: string;
  /** Stored gallery path. */
  imagePath: string;
  sortOrder: number;
  published: boolean;
};

const IMAGE_PATH = /^(branding|products|affiliates)\/[\w.-]{1,200}$/;

export const testimonialInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "اكتب اسم صاحب الشهادة.").max(120),
    roleAr: z.string().trim().max(160),
    roleEn: z.string().trim().max(160),
    organizationAr: z.string().trim().max(160),
    organizationEn: z.string().trim().max(160),
    quoteAr: z.string().trim().max(1200),
    quoteEn: z.string().trim().max(1200),
    imagePath: z
      .string()
      .trim()
      .max(240)
      .refine((v) => v === "" || IMAGE_PATH.test(v), "مسار الصورة غير صالح."),
    sortOrder: z.number().int().min(0).max(9_999),
    published: z.boolean(),
  })
  .refine((v) => v.quoteAr !== "" || v.quoteEn !== "", "اكتب نص الشهادة.");
export type TestimonialInput = z.infer<typeof testimonialInputSchema>;

/** Text in the visitor's language; a missing translation shows the other language. */
export function testimonialText(t: Testimonial, language: Language) {
  return {
    quote: pick(language, t.quoteAr, t.quoteEn),
    role: pick(language, t.roleAr, t.roleEn),
    organization: pick(language, t.organizationAr, t.organizationEn),
  };
}

export const TESTIMONIALS_URL = "https://www.e20e.tools/testimonials";

/**
 * Search-engine signals for the testimonials page: hidden from search while it is
 * empty, indexable with structured quotes once real testimonials are published.
 */
export function testimonialsSeo(list: Testimonial[]): {
  noindex: boolean;
  jsonLd: Record<string, unknown> | null;
} {
  const published = list.filter((t) => t.published && (t.quoteEn || t.quoteAr));
  if (published.length === 0) return { noindex: true, jsonLd: null };
  return {
    noindex: false,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Customer testimonials — E20E Tools",
      url: TESTIMONIALS_URL,
      about: { "@type": "Organization", name: "E20E Tools", url: "https://www.e20e.tools" },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: published.length,
        itemListElement: published.map((t, index) => {
          const text = testimonialText(t, "en");
          return {
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "Quotation",
              text: text.quote,
              ...(t.quoteAr && t.quoteEn ? { inLanguage: ["en", "ar"] } : {}),
              creator: {
                "@type": "Person",
                name: t.name,
                ...(text.role ? { jobTitle: text.role } : {}),
                ...(text.organization
                  ? { worksFor: { "@type": "Organization", name: text.organization } }
                  : {}),
              },
            },
          };
        }),
      },
    },
  };
}
