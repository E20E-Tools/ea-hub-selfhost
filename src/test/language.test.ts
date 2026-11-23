import { describe, expect, it } from "vitest";
import { directionOf, pick, pickList, resolveLanguage } from "../lib/language-core";
import { fill, fill2 } from "../lib/copy";

describe("visitor language choice", () => {
  it("keeps the saved choice over the browser language", () => {
    expect(resolveLanguage("en", "ar-SA")).toBe("en");
    expect(resolveLanguage("ar", "en-GB")).toBe("ar");
  });

  it("opens in Arabic when nothing was saved, whatever the browser language", () => {
    expect(resolveLanguage(null, "ar-EG")).toBe("ar");
    expect(resolveLanguage(null, "en-GB")).toBe("ar");
    expect(resolveLanguage("de", "en-US")).toBe("ar");
  });

  it("writes right-to-left for Arabic and left-to-right for English", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("falls back to the other language instead of leaving a blank field", () => {
    expect(pick("en", "وصف عربي", "")).toBe("وصف عربي");
    expect(pick("en", "وصف عربي", "English text")).toBe("English text");
    expect(pick("ar", "", "English only")).toBe("English only");
    expect(pick("ar", "  ", "English only")).toBe("English only");
  });

  it("uses an empty English feature list only when the Arabic one is empty too", () => {
    expect(pickList("en", ["ميزة"], ["Feature"])).toEqual(["Feature"]);
    expect(pickList("en", ["ميزة"], [])).toEqual(["ميزة"]);
    expect(pickList("ar", ["ميزة"], ["Feature"])).toEqual(["ميزة"]);
  });

  it("fills translated sentences in the order the placeholders appear", () => {
    expect(fill2("%s من %s مهمة", "4", "10")).toBe("4 من 10 مهمة");
    expect(fill("شكرًا %s.", "خالد")).toBe("شكرًا خالد.");
  });
});
