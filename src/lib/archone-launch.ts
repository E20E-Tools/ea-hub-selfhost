import { isPublicationDate } from "./publication-date";

/**
 * Launch moments come from each product's publication date (a calendar day, no time zone).
 * ArchONE opens at 09:00 Riyadh; other products at 00:00 Riyadh. Riyadh is UTC+3 all year.
 */
export const ARCHONE_ID = "archone";
const RIYADH_OFFSET_MS = 3 * 3_600_000;

export function launchInstantFor(id: string, date: string | null | undefined): Date | null {
  if (!date || !isPublicationDate(date)) return null;
  const time = id === ARCHONE_ID ? "09:00:00" : "00:00:00";
  const at = new Date(`${date}T${time}+03:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** True once the product's launch moment has passed (display logic only, nothing is stored). */
export function hasLaunched(
  id: string,
  date: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const at = launchInstantFor(id, date);
  return at !== null && at.getTime() <= now;
}

const locale = (ar: boolean) => (ar ? "ar-u-nu-latn" : "en-GB");

/** Short badge text, e.g. "Launches 22 Nov 2026"; empty when no publication date is set. */
export function archoneLaunchLabel(ar: boolean, date: string | null | undefined): string {
  const at = launchInstantFor(ARCHONE_ID, date);
  if (!at) return "";
  const text = new Intl.DateTimeFormat(locale(ar), {
    day: "numeric",
    month: ar ? "long" : "short",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(at);
  return ar ? `يُطلق ${text}` : `Launches ${text}`;
}

/** Full launch day with weekday in Riyadh time, e.g. "Sunday 22 November 2026". */
export function launchDayLabel(at: Date, ar: boolean): string {
  return new Intl.DateTimeFormat(locale(ar), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(at);
}

export function launchMonthLabel(at: Date, ar: boolean): string {
  return new Intl.DateTimeFormat(locale(ar), {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(at);
}

/** Riyadh calendar month containing the launch: leading blanks then day numbers. */
export function launchMonthGrid(at: Date): { cells: (number | null)[]; day: number } {
  const local = new Date(at.getTime() + RIYADH_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    cells: [
      ...Array<null>(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ],
    day: local.getUTCDate(),
  };
}

/** UTC basic format used by iCalendar and Google Calendar, e.g. 20261122T060000Z. */
export function calendarStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

const PAGE_URL = "https://www.e20e.tools/archone-coming-soon";

export function launchIcs(at: Date): string {
  const end = new Date(at.getTime() + 3_600_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//E20E Tools//ArchONE//EN",
    "BEGIN:VEVENT",
    "UID:archone-launch@e20e.tools",
    `DTSTAMP:${calendarStamp(at)}`,
    `DTSTART:${calendarStamp(at)}`,
    `DTEND:${calendarStamp(end)}`,
    "SUMMARY:ArchONE launch",
    `URL:${PAGE_URL}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Opens Google Calendar with the launch pre-filled; the visitor saves it to their own calendar. */
export function launchGoogleCalendarHref(at: Date, ar: boolean): string {
  const end = new Date(at.getTime() + 3_600_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ar ? "إطلاق ArchONE" : "ArchONE launch",
    dates: `${calendarStamp(at)}/${calendarStamp(end)}`,
    ctz: "Asia/Riyadh",
    details: ar
      ? `موعد إطلاق ArchONE من E20E Tools.\n${PAGE_URL}`
      : `ArchONE launch by E20E Tools.\n${PAGE_URL}`,
    location: PAGE_URL,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Where the page sends visitors: null keeps the countdown, otherwise the target path. */
export function archoneSoonTarget(
  product: { id: string; comingSoon?: boolean; publicationDate?: string } | undefined,
  now: number,
): "home" | "product" | null {
  if (!product) return "home";
  if (!product.comingSoon) return "product";
  const at = launchInstantFor(product.id, product.publicationDate);
  return at && at.getTime() <= now ? "product" : null;
}
