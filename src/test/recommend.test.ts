import { describe, expect, it } from "vitest";
import { catalogLines, sanitizeRecommendation } from "@/lib/recommend.shared";

describe("Assistant recommendations", () => {
  it("keeps only real catalogue ids, drops duplicates and caps at three picks", () => {
    const result = sanitizeRecommendation({
      summary: "  ابدأ بخريطة التقنيات.  ",
      picks: [
        { id: "radar", reason: "لأنك تحتاج قرار تبنٍّ واضح." },
        { id: "ghost", reason: "أداة غير موجودة في الكتالوج." },
        { id: "landscape", reason: "خريطة العلاقات بين التطبيقات." },
        { id: "radar", reason: "مكررة." },
        { id: "platform", reason: "ليست متاحة بعد." },
        { id: "archone", reason: "نمذجة القدرات." },
      ],
    });
    expect(result.summary).toBe("ابدأ بخريطة التقنيات.");
    expect(result.picks.map((pick) => pick.id)).toEqual([
      "radar",
      "landscape",
      "archone",
    ]);
  });

  it("gives the chat guide each tool's direct page instead of a general site address", () => {
    const lines = catalogLines(
      [
        {
          id: "landscape",
          name: "Landscape",
          label: "خريطة التقنيات",
          description: "خريطة التطبيقات وعلاقاتها",
        },
      ],
      "ar",
    );
    expect(lines).toContain("page=/product/landscape");
    expect(lines).not.toContain("page=https://www.e20e.tools");
  });

  it("never offers the coming-soon product as an available tool", () => {
    expect(catalogLines()).not.toContain("id=platform");
    expect(catalogLines()).toContain("id=archone");
    expect(
      sanitizeRecommendation({
        summary: "",
        picks: [{ id: "platform", reason: "منصة" }],
      }).picks,
    ).toEqual([]);
  });

  it("returns an empty recommendation when the model answers with garbage", () => {
    expect(sanitizeRecommendation(null)).toEqual({ summary: "", picks: [] });
    expect(sanitizeRecommendation({ summary: 5, picks: "لا شيء" })).toEqual({
      summary: "",
      picks: [],
    });
  });
});
