import { describe, expect, it } from "vitest";
import { searchSettings } from "@/lib/settings-search.shared";

describe("settings directory field search", () => {
  it.each(["اختبار المحادثة", "إخْتِبَار المحادثه", "test chat"])(
    "opens the Archy comparison question for %s",
    (query) => {
      expect(searchSettings(query)[0]).toMatchObject({
        tab: "ai",
        control: "archy-test-input",
      });
    },
  );

  it.each(["محرك الزوار", "visitor engine"])(
    "finds the visitor engine for %s",
    (query) => {
      expect(searchSettings(query)[0]?.control).toBe("archy-engine");
    },
  );

  it("finds the main menu using the Arabic spelling without a hamza", () => {
    expect(searchSettings("ترتيب الازرار")[0]?.tab).toBe("navigation");
  });
});
