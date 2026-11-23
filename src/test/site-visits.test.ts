import { describe, expect, it } from "vitest";
import { riyadhDay, summarizeContacts } from "@/lib/site-visits.shared";
import { requestSearchTerm } from "@/lib/admin.functions";

describe("site visit counting", () => {
  it("rolls the day over at midnight Riyadh time (21:00 UTC)", () => {
    expect(riyadhDay(new Date("2026-11-13T20:59:00Z"))).toBe("2026-11-13");
    expect(riyadhDay(new Date("2026-11-13T21:00:00Z"))).toBe("2026-11-14");
  });
  it("counts a visitor who chatted and requested once in each total, merging email case", () => {
    const r = summarizeContacts(
      [
        { visitor_email: "A@x.com", visitor_name: "A" },
        { visitor_email: "a@x.com", visitor_name: "" },
      ],
      [
        { email: "a@x.com", name: "" },
        { email: "b@x.com", name: "B" },
      ],
    );
    expect(r.chatted).toBe(1);
    expect(r.requested).toBe(2);
    expect(r.contacts).toHaveLength(2);
  });
});

describe("support search", () => {
  it("strips characters that could break the database filter", () => {
    expect(requestSearchTerm("a,b(c)%_*.d:e")).toBe("a b c d e");
  });
});
