import { describe, expect, it } from "vitest";
import { isPublicationDate } from "@/lib/publication-date";

describe("Product publication dates", () => {
  it("accepts calendar dates without a time component", () => {
    expect(isPublicationDate("2026-11-22")).toBe(true);
    expect(isPublicationDate("2028-02-29")).toBe(true);
  });
  it("rejects overflow dates and timestamps", () => {
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-11-22T09:00:00Z",
      "0000-01-01",
    ]) {
      expect(isPublicationDate(value)).toBe(false);
    }
  });
});
