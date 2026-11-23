import { z } from "zod";

const planSchema = z.object({
  id: z.uuid(), tool: z.string(), goal: z.string(), owner: z.string(),
  date: z.iso.date(), criterion: z.string(), reason: z.string(),
});
const attemptSchema = z.object({
  id: z.uuid(), task: z.string(), result: z.string(),
  link: z.string().transform(value => {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }),
});
const reviewSchema = z.object({
  choice: z.enum(["adopt", "extend", "alternative"]), reason: z.string(),
  date: z.iso.date(), next: z.string(),
});
const trialSchema = planSchema.extend({
  ownerKey: z.uuid(), invite: z.uuid(), shared: z.boolean(), closed: z.boolean(),
  attempts: z.array(attemptSchema), reviews: z.array(reviewSchema),
  feedback: z.array(z.object({outcome: z.enum(["yes","partial","no"]), note: z.string()})).default([]),
});
export type Plan = z.infer<typeof planSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Trial = z.infer<typeof trialSchema>;
const prefix = "ea-team-trial:v1:";
export const trialEvent = "ea-team-trials-changed";
export function allTrials(): Trial[] {
  const records: Trial[] = [];
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix)) continue;
    try {
      const record = trialSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (record.success && prefix + record.data.id === key) records.push(record.data);
    } catch {
      /* Skip unreadable entries. */
    }
  }
  return records;
}
function write(t: Trial) {
  localStorage.setItem(prefix + t.id, JSON.stringify(trialSchema.parse(t)));
  window.dispatchEvent(new Event(trialEvent));
}
export function startTrial(plan: Plan) {
  if (!localStorage.getItem(prefix + plan.id))
    write({
      ...plan,
      ownerKey: crypto.randomUUID(),
      invite: crypto.randomUUID(),
      shared: false,
      closed: false,
      attempts: [],
      reviews: [],
      feedback: [],
    });
}
export function updateTrial(id: string, change: (trial: Trial) => Trial) {
  const existing = localStorage.getItem(prefix + id);
  if (!existing) throw Error("Missing trial");
  const record = trialSchema.parse(JSON.parse(existing));
  if (record.id !== id) throw Error("Trial identifier mismatch");
  write(change(record));
}
export function calendar(t: Trial, ar: boolean) {
  const safe = (text: string) =>
    text
      .replaceAll("\\", "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const file = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//E20E//Team trial//EN",
    "BEGIN:VEVENT",
    "UID:" + t.id + "@e20e.tools",
    "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + t.date.replaceAll("-", ""),
    "SUMMARY:" + safe((ar ? "مراجعة تجربة " : "Review trial: ") + t.tool),
    "DESCRIPTION:" + safe(t.criterion),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([file], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "team-trial.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
