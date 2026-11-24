import { describe, expect, it } from "vitest";
import { waitlistRate, weekWindows } from "@/lib/site-visits.shared";

describe("weekly funnel", () => {
  it("builds four back-to-back 7-day windows ending today, newest first", () => {
    expect(weekWindows(4, "2026-11-23")).toEqual([
      { from: "2026-11-17", to: "2026-11-23" },
      { from: "2026-11-10", to: "2026-11-16" },
      { from: "2026-11-03", to: "2026-11-09" },
      { from: "2026-10-27", to: "2026-11-02" },
    ]);
  });

  it("crosses month and year boundaries", () => {
    expect(weekWindows(1, "2026-01-03")).toEqual([
      { from: "2025-12-28", to: "2026-01-03" },
    ]);
  });

  it("gives waitlist answers per 100 product viewers, or null with no viewers", () => {
    expect(waitlistRate({ productViewers: 40, waitlistAnswers: 3 })).toBe(8);
    expect(waitlistRate({ productViewers: 0, waitlistAnswers: 2 })).toBeNull();
  });
});
