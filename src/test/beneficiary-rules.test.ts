import { describe, expect, it } from "vitest";
import { discoverProducts, discoveryCriteria, planningPhases } from "@/lib/discovery";
import { normalizeBeneficiaryDetails } from "@/lib/beneficiary-metadata";
import { decodeComparisonIds, parseMyTools, toggleComparison, readMyTools } from "@/lib/my-tools";
import {
  monthlyRequestCount,
  riyadhMonth,
  summarizeJourney,
  type JourneyAggregateRow,
} from "@/lib/journey.shared";
import type { Product } from "@/lib/products";

const product: Product = {
  id: "radar",
  name: "Tech Radar",
  category: "technology",
  label: "تقييم التقنيات",
  description: "تقييم التقنيات وتصنيفها",
  descriptionEn: "Assess and classify technologies",
  overview: "مراجعة دورية",
  overviewEn: "Recurring review",
  features: ["سجل قرارات"],
  featuresEn: ["Decision log"],
  url: "",
  keywords: "radar assessment",
};

describe("catalog-grounded discovery", () => {
  it("uses literal current catalog evidence without a numeric compatibility score", () => {
    const [match] = discoverProducts(
      [product],
      { goal: "technology", organizationSize: "large", maturity: "starting" },
      "en",
    );
    expect(match?.product.id).toBe("radar");
    expect(match?.evidence.some((item) => item.text === product.descriptionEn)).toBe(true);
    expect(match?.organizationFit).toBeNull();
    expect(match?.maturityFit).toBeNull();
    expect(match).not.toHaveProperty("score");
  });
  it("quotes actual localized fields and returns the same tool in both languages", () => {
    const answers = { goal: "technology", organizationSize: "", maturity: "" } as const;
    const english = discoverProducts([product], answers, "en")[0];
    const arabic = discoverProducts([product], answers, "ar")[0];
    expect(english?.product.id).toBe(arabic?.product.id);
    expect(english?.evidence.some((item) => item.text === product.descriptionEn)).toBe(true);
    expect(arabic?.evidence.some((item) => item.text === product.description)).toBe(true);
  });
  it("excludes explicit organization/maturity mismatches and drops unknown enum values", () => {
    const details = normalizeBeneficiaryDetails({
      organizationSizes: ["large", "huge"],
      maturityLevels: ["starting"],
      goals: ["technology", "other"],
    });
    expect(details).toMatchObject({
      organizationSizes: ["large"],
      maturityLevels: ["starting"],
      goals: ["technology"],
    });
    expect(
      discoverProducts(
        [{ ...product, beneficiaryDetails: details }],
        { goal: "technology", organizationSize: "small", maturity: "starting" },
        "en",
      ),
    ).toHaveLength(0);
    const match = discoverProducts(
      [{ ...product, beneficiaryDetails: details }],
      { goal: "technology", organizationSize: "large", maturity: "starting" },
      "en",
    )[0];
    expect(match?.organizationFit).toBe(true);
    expect(match?.maturityFit).toBe(true);
  });
  it("never treats a category or hidden keyword as sufficient evidence", () => {
    const unrelated = {
      ...product,
      name: "Inventory",
      label: "عام",
      labelEn: "General",
      description: "A general inventory",
      descriptionEn: "A general inventory",
      overview: "No relevant detail",
      overviewEn: "No relevant detail",
      features: ["Ownership"],
      featuresEn: ["Ownership"],
      keywords: "radar assessment",
    };
    expect(
      discoverProducts(
        [unrelated],
        { goal: "technology", organizationSize: "", maturity: "" },
        "en",
      ),
    ).toHaveLength(0);
  });
  it("does not confuse idea assessment or application costs with technology and landscape goals", () => {
    const ideaTool = {
      ...product,
      id: "innovation",
      name: "Innovation",
      label: "إدارة الابتكار",
      labelEn: "Innovation Management",
      description: "جمع الأفكار وتقييمها",
      descriptionEn: "Collect and assess ideas",
      overview: "متابعة المبادرات",
      overviewEn: "Follow initiatives",
      features: ["تقييم الأفكار"],
      featuresEn: ["Assess ideas"],
      keywords: "",
    };
    expect(
      discoverProducts(
        [ideaTool],
        { goal: "technology", organizationSize: "", maturity: "" },
        "en",
      ),
    ).toHaveLength(0);
    const costTool = {
      ...ideaTool,
      id: "itfm",
      name: "ITFM",
      description: "تتبع تكلفة كل تطبيق",
      descriptionEn: "Track the cost of every application",
    };
    expect(
      discoverProducts(
        [costTool],
        { goal: "applications", organizationSize: "", maturity: "" },
        "en",
      ),
    ).toHaveLength(0);
  });
  it("asks organization and maturity questions only when real metadata exists", () => {
    expect(discoveryCriteria([product])).toEqual({ organizationSize: false, maturity: false });
    expect(
      discoveryCriteria([
        {
          ...product,
          beneficiaryDetails: normalizeBeneficiaryDetails({
            organizationSizes: ["large"],
            maturityLevels: ["starting"],
          }),
        },
      ]),
    ).toEqual({ organizationSize: true, maturity: true });
  });
  it("keeps coming-soon tools out of available results and labels them when explicitly included", () => {
    const comingSoon = { ...product, comingSoon: true };
    const answers = { goal: "technology", organizationSize: "", maturity: "" } as const;
    expect(discoverProducts([comingSoon], answers, "en")).toHaveLength(0);
    const informational = discoverProducts([comingSoon], answers, "en", {
      includeComingSoon: true,
    });
    expect(informational).toHaveLength(1);
    expect(informational[0]?.product.comingSoon).toBe(true);
  });
});

describe("local comparison and storage", () => {
  it("enforces three IDs, removes selections and ignores unsafe URL values", () => {
    expect(toggleComparison(["aa", "bb"], "cc")).toEqual({
      ids: ["aa", "bb", "cc"],
      limited: false,
    });
    expect(toggleComparison(["aa", "bb", "cc"], "dd")).toEqual({
      ids: ["aa", "bb", "cc"],
      limited: true,
    });
    expect(toggleComparison(["aa", "bb"], "aa").ids).toEqual(["bb"]);
    expect(decodeComparisonIds("radar,../secret,landscape,extra")).toEqual([
      "radar",
      "landscape",
      "extra",
    ]);
  });
  it("fails closed on malformed JSON and unavailable storage without catalog copies", () => {
    expect(parseMyTools("not-json")).toEqual({
      value: { favorites: [], compare: [] },
      status: "malformed",
    });
    expect(readMyTools(null).status).toBe("unavailable");
    const parsed = parseMyTools(
      JSON.stringify({ favorites: ["radar"], compare: ["radar"], email: "not-allowed" }),
    );
    expect(parsed.value).toEqual({ favorites: ["radar"], compare: ["radar"] });
    expect(JSON.stringify(parsed.value)).not.toContain("email");
  });
});

describe("illustrative planning and aggregate outcomes", () => {
  it("bounds synthetic inputs and always returns positive phases", () => {
    expect(planningPhases(0, 0, 2)).toEqual({ discovery: 1, pilot: 1, review: 1 });
    expect(planningPhases(99999, 9999999, 999).discovery).toBeGreaterThan(0);
  });
  it("distinguishes zero counts from unknown rates and computes real denominators", () => {
    expect(summarizeJourney([])).toMatchObject({
      chooserCompletionRate: null,
      comparisonToolRate: null,
      averageRating: null,
    });
    const summary = summarizeJourney([
      { day: "2026-11-14", event: "chooser_started", language: "en", count: 4, rating_sum: 0 },
      { day: "2026-11-14", event: "chooser_completed", language: "ar", count: 3, rating_sum: 0 },
      { day: "2026-11-14", event: "journey_rating", language: "en", count: 2, rating_sum: 9 },
    ]);
    expect(summary.chooserCompletionRate).toBe(75);
    expect(summary.averageRating).toBe(4.5);
  });
  it("counts each confirmed request aggregate in the Riyadh calendar month only", () => {
    expect(riyadhMonth(new Date("2026-11-30T21:00:00.000Z"))).toBe("2026-12");
    const rows: JourneyAggregateRow[] = [
      { day: "2026-11-01", event: "request_completed", language: "en", count: 2, rating_sum: 0 },
      { day: "2026-11-14", event: "request_completed", language: "ar", count: 3, rating_sum: 0 },
      { day: "2026-10-31", event: "request_completed", language: "en", count: 9, rating_sum: 0 },
      { day: "2026-11-14", event: "chooser_completed", language: "en", count: 8, rating_sum: 0 },
    ];
    expect(monthlyRequestCount(rows, "2026-11")).toBe(5);
    expect(monthlyRequestCount(rows, "2026-12")).toBe(0);
  });
});
