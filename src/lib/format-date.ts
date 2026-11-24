import type { Language } from "./language-core";

/** Formats a date for the active UI language (Arabic or English); "—" when missing/invalid. */
export function formatDate(
  value: string | number | Date | null | undefined,
  language: Language,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    language === "ar" ? "ar" : "en-GB",
    options,
  ).format(date);
}
