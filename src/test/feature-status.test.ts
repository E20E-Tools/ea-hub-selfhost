import { describe, expect, it } from "vitest";
import { featureStatusRows } from "@/lib/feature-status";
import { FEATURE_KEYS, normalizeFeatureFlags } from "@/lib/site-features";
import { adminDictionaries } from "@/lib/admin-copy";

describe("admin feature status page", () => {
  it("lists every feature with its saved on/off state", () => {
    const rows = featureStatusRows(normalizeFeatureFlags({ arabic: false }));
    expect(rows.map((r) => r.key)).toEqual([...FEATURE_KEYS]);
    expect(rows.find((r) => r.key === "arabic")?.enabled).toBe(false);
    expect(rows.find((r) => r.key === "assistant")?.enabled).toBe(true);
  });
  it("shows the page each feature controls, /about for the About page", () => {
    const rows = featureStatusRows(normalizeFeatureFlags({}));
    expect(rows.find((r) => r.key === "blog")?.path).toBe("/about");
    expect(rows.find((r) => r.key === "arabic")?.path).toBeNull();
  });
  it("has an Arabic and English description for every feature", () => {
    for (const key of FEATURE_KEYS) {
      for (const lang of ["ar", "en"] as const) {
        const text = (adminDictionaries[lang] as Record<string, string>)[
          `featureAbout_${key}`
        ];
        expect(text, `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});
