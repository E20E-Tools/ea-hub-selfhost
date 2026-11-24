import { launchInstantFor } from "@/lib/archone-launch";
import type { Product } from "@/lib/catalog";
import type { Language } from "@/lib/language-core";

/** Launch instant for a coming-soon product with a publication date (00:00 Riyadh, ArchONE 09:00). */
export function launchInstant(
  product: Pick<Product, "id" | "publicationDate">,
): Date | null {
  return launchInstantFor(product.id, product.publicationDate);
}

/** Remaining whole days and hours, or null once the moment has passed. */
export function countdownParts(
  target: Date,
  now: Date,
): { days: number; hours: number } | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  const hoursTotal = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hoursTotal / 24), hours: hoursTotal % 24 };
}

export function formatLaunchDate(date: string, language: Language): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
}
