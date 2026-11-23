import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAVIGATION,
  isNavigationUrl,
  moveNavigation,
  navigationLabel,
  navigationSchema,
  readNavigation,
  placedNavigation,
} from "@/lib/navigation.shared";

describe("Editable navigation", () => {
  it("points consultations to the supplied DT Guide address", () => {
    expect(DEFAULT_NAVIGATION.find((item) => item.id === "consultations")?.url).toBe(
      "https://www.dt.guide/itconsultations/",
    );
  });
  it("points courses to the supplied DT Guide address", () => {
    expect(DEFAULT_NAVIGATION.find((item) => item.id === "courses")?.url).toBe(
      "https://www.dt.guide/courses/",
    );
  });
  it("preserves deleted items and an empty menu instead of restoring defaults", () => {
    expect(readNavigation([])).toEqual([]);
    expect(readNavigation(DEFAULT_NAVIGATION.slice(1)).map((item) => item.id)).not.toContain(
      "library",
    );
  });
  it("keeps explicit placements, reordered links and deletions after saving a legacy menu", () => {
    const migrated = placedNavigation(DEFAULT_NAVIGATION);
    expect(migrated.find(item => item.url === "/my-tools")?.group).toBe("workspace");
    expect(migrated.find(item => item.url === "/about")?.group).toBe("company");
    const configured = moveNavigation(migrated, 1, -1)
      .filter(item => item.url !== "/my-tools")
      .map(item => item.id === "roadmap" ? { ...item, group: "appearance" as const, topBar: true } : item);
    expect(placedNavigation(navigationSchema.parse(configured))).toEqual(configured);
    expect(placedNavigation([])).toEqual([]);
  });
  it("moves entries in the requested order", () => {
    const moved = moveNavigation(DEFAULT_NAVIGATION, 5, -1);
    expect(moved[4]?.id).toBe("courses");
    expect(moved[5]?.id).toBe("consultations");
    expect(DEFAULT_NAVIGATION[4]?.id).toBe("consultations");
  });
  it("retains edited links and names in both languages", () => {
    const item = navigationSchema.parse([
      {
        id: "custom",
        labelAr: "خدماتنا",
        labelEn: "Our services",
        url: "https://www.dt.guide/",
        cta: false,
      },
    ])[0];
    if (!item) throw new Error("Missing fixture");
    expect(navigationLabel(item, "en")).toBe("Our services");
    expect(navigationLabel(item, "ar")).toBe("خدماتنا");
    expect(item.url).toBe("https://www.dt.guide/");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.test",
    "http://example.com",
    "https://user:pass@example.com",
    "/admin",
    "/events",
    "/missing",
  ])("rejects unsafe or missing destination %s", (url) => {
    expect(isNavigationUrl(url)).toBe(false);
  });
  it("accepts supported internal destinations with query parameters", () => {
    expect(isNavigationUrl("/request?type=support")).toBe(true);
  });
  it("allows the affiliates page as an editable navigation destination", () => {
    expect(isNavigationUrl("/affiliates")).toBe(true);
  });
  it("keeps the terms of service page reachable from the default menu", () => {
    const terms = DEFAULT_NAVIGATION.find((item) => item.url === "/terms");
    expect(terms?.labelAr).toBe("شروط الخدمة");
    expect(terms?.labelEn).toBe("Terms of service");
    expect(isNavigationUrl("/terms")).toBe(true);
  });
  it("rejects duplicate IDs", () => {
    const item = DEFAULT_NAVIGATION[0];
    expect(navigationSchema.safeParse([item, item]).success).toBe(false);
  });
});
