/**
 * Archy greeting settings (browser-safe). Saved by admins in site_settings.archy_greeting;
 * empty text falls back to the built-in greeting so visitors never see a blank bubble.
 */
import { z } from "zod";
import type { Language } from "./language-core";

export const ARCHY_GREETING_MAX = 160;
export const ARCHY_RATE_RANGE = [0.6, 1.4] as const;
export const ARCHY_PITCH_RANGE = [0.6, 1.4] as const;
export const ARCHY_GUIDE_DELAY_RANGE = [1, 30] as const;

export type ArchyGreetingSettings = {
  ar: string;
  en: string;
  voiceOn: boolean;
  rate: number;
  pitch: number;
  /** Open the guide card by itself once per session after the greeting. */
  autoGuide: boolean;
  /** Seconds after the greeting before the guide card opens. */
  guideDelay: number;
};

export const DEFAULT_ARCHY_GREETING: ArchyGreetingSettings = {
  ar: "",
  en: "",
  voiceOn: true,
  rate: 0.96,
  pitch: 1.02,
  autoGuide: true,
  guideDelay: 3,
};

const clamp = (value: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normalizeArchyGreeting(value: unknown): ArchyGreetingSettings {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, ARCHY_GREETING_MAX) : "");
  return {
    ar: str(row["ar"]),
    en: str(row["en"]),
    voiceOn: row["voiceOn"] !== false,
    rate: clamp(row["rate"], ARCHY_RATE_RANGE, DEFAULT_ARCHY_GREETING.rate),
    pitch: clamp(row["pitch"], ARCHY_PITCH_RANGE, DEFAULT_ARCHY_GREETING.pitch),
    autoGuide: row["autoGuide"] !== false,
    guideDelay: Math.round(
      clamp(row["guideDelay"], ARCHY_GUIDE_DELAY_RANGE, DEFAULT_ARCHY_GREETING.guideDelay),
    ),
  };
}

/** Saved text for the visitor language, otherwise the built-in greeting for that language. */
export function archyGreetingText(
  settings: ArchyGreetingSettings,
  language: Language,
  fallback: string,
): string {
  const saved = language === "ar" ? settings.ar : settings.en;
  return saved || fallback;
}

export const archyGreetingSchema = z.object({
  ar: z.string().trim().max(ARCHY_GREETING_MAX),
  en: z.string().trim().max(ARCHY_GREETING_MAX),
  voiceOn: z.boolean(),
  rate: z.number().min(ARCHY_RATE_RANGE[0]).max(ARCHY_RATE_RANGE[1]),
  pitch: z.number().min(ARCHY_PITCH_RANGE[0]).max(ARCHY_PITCH_RANGE[1]),
  autoGuide: z.boolean(),
  guideDelay: z.number().int().min(ARCHY_GUIDE_DELAY_RANGE[0]).max(ARCHY_GUIDE_DELAY_RANGE[1]),
});

export type ArchyRoute = "tool" | "support" | "request" | "guide";

/**
 * Which chat Archy suggests before the visitor picks one. The page wins (a tool page
 * suggests that tool); otherwise an open support request suggests following up with the team.
 */
export function suggestArchyRoute(pathname: string, openSupport: number): ArchyRoute {
  if (/^\/product\/[^/]+/.test(pathname)) return "tool";
  if (pathname.startsWith("/support")) return "support";
  if (pathname.startsWith("/request") || pathname.startsWith("/enterprise-services"))
    return "request";
  if (openSupport > 0) return "support";
  return "guide";
}
