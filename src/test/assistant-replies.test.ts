import { describe, expect, it } from "vitest";
import {
  filterAssistantReplies,
  type AssistantReplyRow,
} from "@/lib/admin-monitor.shared";

const rows: AssistantReplyRow[] = [
  {
    id: "1",
    visitor_email: "a@x.com",
    visitor_name: "Ahmed",
    reply: "جرّب Tech Radar",
    language: "ar",
    created_at: "2026-10-01T10:00:00Z",
  },
  {
    id: "2",
    visitor_email: "b@y.com",
    visitor_name: "Sara",
    reply: "Try ArchONE",
    language: "en",
    created_at: "2026-10-05T10:00:00Z",
  },
];

describe("filterAssistantReplies", () => {
  it("matches visitor email, name or reply text", () => {
    expect(filterAssistantReplies(rows, "sara", "", "")).toHaveLength(1);
    expect(filterAssistantReplies(rows, "archone", "", "")).toHaveLength(1);
    expect(filterAssistantReplies(rows, "a@x.com", "", "")[0]?.id).toBe("1");
  });

  it("filters by UTC date range", () => {
    expect(filterAssistantReplies(rows, "", "2026-10-02", "")).toHaveLength(1);
    expect(filterAssistantReplies(rows, "", "", "2026-10-01")).toHaveLength(1);
  });
});
