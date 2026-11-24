import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMS_AR,
  DEFAULT_TERMS_EN,
  normalizeTerms,
  parseTerms,
  termsText,
} from "@/lib/terms";
import { resolveAdminLocation } from "@/lib/admin-sections";

describe("terms of service", () => {
  it("falls back to the draft when nothing is saved", () => {
    const empty = normalizeTerms({});
    expect(termsText(empty, "ar")).toBe(DEFAULT_TERMS_AR);
    expect(termsText(empty, "en")).toBe(DEFAULT_TERMS_EN);
  });
  it("uses the saved text when present", () => {
    expect(termsText(normalizeTerms({ ar: "## أ\nنص" }), "ar")).toBe(
      "## أ\nنص",
    );
  });
  it("draft is governed by Saudi law", () => {
    expect(DEFAULT_TERMS_EN).toContain("Kingdom of Saudi Arabia");
    expect(DEFAULT_TERMS_AR).toContain("المملكة العربية السعودية");
  });
  it("splits sections on ## lines", () => {
    expect(parseTerms("## A\none\n\ntwo\n## B\nthree")).toEqual([
      { title: "A", paragraphs: ["one", "two"] },
      { title: "B", paragraphs: ["three"] },
    ]);
  });
  it("enterprise requests is its own admin section", () => {
    expect(resolveAdminLocation("enterprise").section).toBe("enterprise");
  });
});
