import { describe, expect, it } from "vitest";
import { effectiveLanguage } from "./language-core";
import { normalizeFeatureFlags } from "./site-features";

describe("admin Arabic switch", () => {
  it("is on by default so existing sites keep Arabic", () => {
    expect(normalizeFeatureFlags({}).arabic).toBe(true);
  });

  it("turns off only on an explicit false", () => {
    expect(normalizeFeatureFlags({ arabic: false }).arabic).toBe(false);
  });

  it("shows English on visitor pages when Arabic is off", () => {
    expect(effectiveLanguage("ar", false, false)).toBe("en");
  });

  it("keeps the admin console bilingual when Arabic is off", () => {
    expect(effectiveLanguage("ar", false, true)).toBe("ar");
  });

  it("keeps the visitor's Arabic choice when Arabic is on", () => {
    expect(effectiveLanguage("ar", true, false)).toBe("ar");
  });
});
