import { z } from "zod";

export const assistantRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
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
