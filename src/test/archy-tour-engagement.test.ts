import { describe, expect, it } from "vitest";
import {
  summarizeTourVisits,
  type TourVisit,
} from "@/lib/archy-tour-visits.shared";

function row(key: string, values: Partial<TourVisit> = {}): TourVisit {
  return {
    id: key,
    visitor_key: key,
    started_at: "2026-11-13T23:00:00Z",
    completed_at: null,
    chat_opened_at: null,
    visitor_name: "",
    visitor_email: "",
    support_request_id: null,
    support_submitted_at: null,
    ...values,
  };
}
describe("Archy engagement", () => {
  it("counts repeated tours once per browser and calculates completion from starters", () => {
    const result = summarizeTourVisits([
      row("a"),
      row("a", { completed_at: "2026-11-13T23:01:00Z" }),
      row("b"),
    ]);
    expect(result).toMatchObject({
      tours: 3,
      started: 2,
      completed: 1,
      completionRate: 50,
    });
  });
  it("counts chat and saved support only after completion, once per browser", () => {
    const done = {
      completed_at: "2026-11-13T23:01:00Z",
      chat_opened_at: "2026-11-13T23:02:00Z",
      support_submitted_at: "2026-11-13T23:03:00Z",
      support_request_id: "receipt-1",
    };
    expect(
      summarizeTourVisits([
        row("a", done),
        row("a", done),
        row("b", { ...done, completed_at: null }),
        row("c", { ...done, support_request_id: null }),
      ]),
    ).toMatchObject({ started: 3, completed: 2, chatted: 2, supported: 1 });
  });
  it("does not invent a completion percentage without starts", () => {
    expect(summarizeTourVisits([])).toMatchObject({
      started: 0,
      completionRate: null,
    });
  });
});
