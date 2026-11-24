import { describe, expect, it } from "vitest";
import { tourVisitPatch } from "@/lib/archy-tour-visits.shared";

const start = {
  started_at: "2026-11-13T23:00:00Z",
  completed_at: null,
  chat_opened_at: null,
};
const now = "2026-11-13T23:01:00Z";
describe("Archy visitor outcomes", () => {
  it("records reaching 100% once", () => {
    expect(tourVisitPatch(start, "completed", now)).toEqual({
      completed_at: now,
    });
    expect(
      tourVisitPatch(
        { ...start, completed_at: now },
        "completed",
        "2026-11-13T23:02:00Z",
      ),
    ).toEqual({});
  });
  it("does not count chat after an incomplete or cancelled tour", () => {
    expect(tourVisitPatch(start, "chat", now)).toEqual({});
  });
  it("records chat only after 100%, preserving the first opening time", () => {
    expect(
      tourVisitPatch(
        { ...start, completed_at: now },
        "chat",
        "2026-11-13T23:02:00Z",
      ),
    ).toEqual({ chat_opened_at: "2026-11-13T23:02:00Z" });
    expect(
      tourVisitPatch(
        { ...start, completed_at: now, chat_opened_at: now },
        "chat",
      ),
    ).toEqual({});
  });
});
