import { z } from "zod";

/** Public "Contact us" details shown on /contact; edited from the admin contact section. */
export type ContactInfo = {
  email: string;
  phone: string;
  website: string;
  addressAr: string;
  addressEn: string;
};

export const contactInfoSchema = z.object({
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "بريد غير صالح",
    ),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^\+?[0-9 ()-]{5,40}$/.test(v), "رقم غير صالح"),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "رابط غير صالح"),
  addressAr: z.string().trim().max(300),
  addressEn: z.string().trim().max(300),
});

export function normalizeContactInfo(value: unknown): ContactInfo {
  const s =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const str = (k: string, max: number) =>
    typeof s[k] === "string" ? (s[k] as string).slice(0, max) : "";
  return {
    email: str("email", 200),
    phone: str("phone", 40),
    website: str("website", 200),
    addressAr: str("addressAr", 300),
    addressEn: str("addressEn", 300),
  };
}
