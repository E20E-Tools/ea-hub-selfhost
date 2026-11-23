import { z } from "zod";

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

export const assistantRegistrationSchema = z.object({
  // Name and email are optional: visitors can ask Archy first and leave contact details
  // only if they want the team to follow up.
  name: z.preprocess(
    trimmed,
    z.union([z.literal(""), z.string().min(2).max(80)]).default(""),
  ),
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.union([z.literal(""), z.string().email().max(200)]).default(""),
  ),
  question: z.string().trim().max(1200).default(""),
  // Arithmetic mode sends token + answer; Turnstile mode sends the widget token instead.
  token: z.string().max(4096).default(""),
  answer: z
    .string()
    .trim()
    .regex(/^\d{0,2}$/)
    .default(""),
  turnstile: z.string().max(2048).default(""),
  website: z.string().max(200).default(""),
  language: z.enum(["ar", "en"]).default("en"),
});
