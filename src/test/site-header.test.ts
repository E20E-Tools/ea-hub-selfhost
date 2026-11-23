import { describe, expect, it } from "vitest";
import { isActivePath, MAIN_NAV } from "@/components/site-header";

describe("Shared site header", () => {
  it("includes affiliates among the main destinations and keeps secondary pages out", () => {
    expect(MAIN_NAV).toHaveLength(6);
    expect(MAIN_NAV.map((i) => i.to)).toEqual([
      "/",
      "/technology-roadmap",
      "/support",
      "/about",
      "/affiliates",
      "/request",
    ]);
    expect(MAIN_NAV.map((i) => i.key)).toEqual([
      "navLibrary",
      "navRoadmap",
      "navSupport",
      "navBlog",
      "navAffiliates",
      "requestCta",
    ]);
  });

  it("marks Library active only on the homepage", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/request", "/")).toBe(false);
  });
  it("does not confuse sibling paths sharing a prefix", () => {
    expect(isActivePath("/supporters", "/support")).toBe(false);
    expect(isActivePath("/support", "/support")).toBe(true);
  });
});
