import { describe, expect, it } from "vitest";
import { isTypingTarget } from "@/components/site-search";
import { MAIN_NAV, SEARCH_PAGES } from "@/components/site-header";

describe("site search", () => {
  it("lists exactly the six menu pages", () => {
    expect(SEARCH_PAGES.map((p) => p.to)).toEqual(MAIN_NAV.map((p) => p.to));
    expect(SEARCH_PAGES).toHaveLength(6);
  });
  it("does not offer the removed feature tracker pages", () => {
    for (const to of ["/overview", "/features", "/feature-reports"])
      expect(SEARCH_PAGES.some((p) => p.to === to)).toBe(false);
  });

  it("no longer offers the removed events and bookings pages", () => {
    expect(
      SEARCH_PAGES.some(
        (p) => (p.to as string) === "/events" || (p.to as string) === "/my-bookings",
      ),
    ).toBe(false);
  });
  it("leaves '/' to text fields", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(
      isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isTypingTarget({ tagName: "BUTTON", isContentEditable: false } as unknown as EventTarget),
    ).toBe(false);
  });
});
