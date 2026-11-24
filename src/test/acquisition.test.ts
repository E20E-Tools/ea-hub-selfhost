import { describe, expect, it } from "vitest";
import { acquisitionGuide, salesMailto } from "@/lib/acquisition";
import { discoverProducts } from "@/lib/discovery";
import type { Product } from "@/lib/products";
import { normalizeBeneficiaryDetails } from "@/lib/beneficiary-metadata";

const soon: Product = {
  id: "itfm",
  name: "ITFM",
  category: "finance",
  label: "إدارة مالية التقنية",
  description: "إدارة تكاليف التقنية والميزانية",
  descriptionEn: "Manage technology cost and budget",
  overview: "",
  features: [],
  url: "",
  keywords: "",
  comingSoon: true,
};

describe("coming-soon acquisition guide", () => {
  it("still lists a coming-soon tool as a match when catalog evidence exists", () => {
    const [match] = discoverProducts(
      [soon],
      { goal: "cost", organizationSize: "", maturity: "" },
      "ar",
      { includeComingSoon: true },
    );
    expect(match?.product.id).toBe("itfm");
  });
  it("shows no invented purchase steps when the owner has entered none", () => {
    expect(acquisitionGuide(soon, "en")?.steps).toEqual([]);
    expect(acquisitionGuide(soon, "ar")?.steps).toEqual([]);
  });
  it("uses owner-entered steps and requirements instead of the defaults", () => {
    const guide = acquisitionGuide(
      {
        ...soon,
        beneficiaryDetails: normalizeBeneficiaryDetails({
          prerequisites: { ar: ["قائمة الأنظمة"], en: ["System inventory"] },
          purchaseSteps: { ar: ["اطلب عرض سعر"], en: ["Ask for a quote"] },
        }),
      },
      "ar",
    );
    expect(guide?.steps).toEqual(["اطلب عرض سعر"]);
    expect(guide?.requirements).toEqual(["قائمة الأنظمة"]);
  });
  it("leaves requirements empty instead of inventing them", () => {
    expect(acquisitionGuide(soon, "ar")?.requirements).toEqual([]);
  });
  it("only announces a launch date for ArchONE, taken from its publication date", () => {
    expect(
      acquisitionGuide({ ...soon, publicationDate: "2026-11-22" }, "en")
        ?.launch,
    ).toBeNull();
    expect(
      acquisitionGuide(
        { ...soon, id: "archone", publicationDate: "2026-11-22" },
        "en",
      )?.launch,
    ).toBe("Launches 22 Nov 2026");
    expect(
      acquisitionGuide(
        { ...soon, id: "archone", publicationDate: "2026-12-05" },
        "ar",
      )?.launch,
    ).toBe("يُطلق 5 ديسمبر 2026");
    expect(
      acquisitionGuide({ ...soon, id: "archone" }, "en")?.launch,
    ).toBeNull();
  });
  it("returns no guide for tools that can already be requested", () => {
    expect(acquisitionGuide({ ...soon, comingSoon: false }, "ar")).toBeNull();
  });
  it("addresses the sales email with the tool name in the subject", () => {
    expect(salesMailto("ea@e20e.tools", "ITFM", "en")).toBe(
      "mailto:ea@e20e.tools?subject=Purchase%20interest%3A%20ITFM",
    );
  });
});
