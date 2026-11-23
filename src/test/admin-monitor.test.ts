import { describe, expect, it } from "vitest";
import { activityCsv, filterActivity } from "@/lib/admin-monitor.shared";

const rows = [
  {
    id: "1",
    actor_email: "owner@example.com",
    action: "ai.settings",
    target: "Groq",
    created_at: "2026-10-20T12:00:00Z",
  },
  {
    id: "2",
    actor_email: "other@example.com",
    action: "product.save",
    target: "radar",
    created_at: "2026-10-19T12:00:00Z",
  },
];
describe("Admin activity filtering and export", () => {
  it("filters assistant operations without including other operations", () =>
    expect(filterActivity(rows, "ai", "", "", "")).toEqual([rows[0]]));
  it("combines actor search with inclusive UTC date bounds", () =>
    expect(filterActivity(rows, "all", "OWNER", "2026-10-20", "2026-10-20")).toEqual([rows[0]]));
  it("excludes dates outside the requested period", () =>
    expect(filterActivity(rows, "all", "", "2026-10-21", "")).toEqual([]));
  it("neutralizes spreadsheet formulas and escapes quoted values", () => {
    const row = rows[0];
    if (!row) throw new Error("Missing fixture");
    const csv = activityCsv([{ ...row, target: '=HYPERLINK("evil")' }]);
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain("owner@example.com");
  });
});
