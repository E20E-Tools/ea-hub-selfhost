import { z } from "zod";

export const PUBLIC_JOURNEY_EVENTS = [
  "contact_started",
  "contact_receipt",
  "service_started",
  "service_receipt",
  "exercise_started","exercise_completed","exercise_requested",
  "case_viewed", "case_opened",
  "chooser_started",
  "chooser_completed",
  "comparison_opened",
  "comparison_tool_opened",
  "demo_completed",
  "journey_rating",
] as const;
export const JOURNEY_EVENTS = [
  ...PUBLIC_JOURNEY_EVENTS,
  "request_completed",
] as const;
/** Browser privacy signals (Global Privacy Control, Do Not Track) disable aggregate counting. */
export function privacySignalInHeaders(headers: Headers): boolean {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
}
export type PublicJourneyEvent = (typeof PUBLIC_JOURNEY_EVENTS)[number];
export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];

export const journeyEventSchema = z
  .object({
    event: z.enum(PUBLIC_JOURNEY_EVENTS),
    language: z.enum(["ar", "en"]),
    eventKey: z.string().uuid(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.event === "journey_rating") !== (value.rating != null))
      ctx.addIssue({ code: "custom", message: "Invalid rating" });
  });

export type JourneyAggregateRow = {
  day: string;
  event: JourneyEvent;
  language: "ar" | "en";
  count: number;
  rating_sum: number;
};
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export function riyadhMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("journeyMonthUnavailable");
  return `${year}-${month}`;
}

export function monthlyRequestCount(
  rows: JourneyAggregateRow[],
  month: string,
): number {
  return rows
    .filter(
      (row) =>
        row.event === "request_completed" &&
        row.day.startsWith(`${month}-`) &&
        Number.isSafeInteger(row.count) &&
        row.count >= 0,
    )
    .reduce((total, row) => total + row.count, 0);
}

export function summarizeJourney(rows: JourneyAggregateRow[]) {
  const totals = Object.fromEntries(
    JOURNEY_EVENTS.map((event) => [event, 0]),
  ) as Record<JourneyEvent, number>;
  let ratingSum = 0;
  for (const row of rows) {
    if (!JOURNEY_EVENTS.includes(row.event)) continue;
    const count =
      Number.isSafeInteger(row.count) && row.count >= 0 ? row.count : 0;
    totals[row.event] += count;
    if (row.event === "journey_rating")
      ratingSum += Number.isSafeInteger(row.rating_sum) ? row.rating_sum : 0;
  }
  return {
    totals,
    chooserCompletionRate: ratio(
      totals.chooser_completed,
      totals.chooser_started,
    ),
    comparisonToolRate: ratio(
      totals.comparison_tool_opened,
      totals.comparison_opened,
    ),
    averageRating:
      totals.journey_rating > 0
        ? Math.round((ratingSum / totals.journey_rating) * 10) / 10
        : null,
  };
}
