import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  buildFilterChips,
  fallbackCatalog,
  filterCatalog,
  isValidColor,
  mapProduct,
  themeCss,
  defaultSettings,
  type ProductRow,
} from "@/lib/catalog";
import { products } from "@/lib/products";

const list = fallbackCatalog.products;

describe("Product library filtering", () => {
  it("searches product names without case sensitivity", () => {
    expect(filterCatalog(list, "  ARCHONE  ", ALL_CATEGORIES).map((p) => p.id)).toEqual([
      "archone",
    ]);
  });
  it("combines category and Arabic search", () => {
    expect(filterCatalog(list, "تقييم", "technology").map((p) => p.id)).toEqual(["radar"]);
    expect(filterCatalog(list, "تقييم", "architecture")).toEqual([]);
  });
  it("returns both technology tools for their category", () => {
    expect(filterCatalog(list, "", "technology").map((p) => p.id)).toEqual(["landscape", "radar"]);
  });
  it("shows only architecture products when Architecture is selected", () => {
    expect(filterCatalog(list, "", "architecture").map((p) => p.id)).toEqual(["archone"]);
  });
  it("shows only platform products when Platforms is selected", () => {
    expect(filterCatalog(list, "", "platform").map((p) => p.id)).toEqual(["platform"]);
  });
  it("restores every product when All is selected", () => {
    expect(filterCatalog(list, "", ALL_CATEGORIES).map((p) => p.id)).toEqual([
      "archone",
      "landscape",
      "radar",
      "platform",
    ]);
  });
  it("returns no products for unmatched searches", () => {
    expect(filterCatalog(list, "nonexistent tool", ALL_CATEGORIES)).toEqual([]);
  });
  it("marks only EA Tool as coming soon, with its name free of the badge text", () => {
    expect(products.filter((p) => p.comingSoon).map((p) => p.id)).toEqual(["platform"]);
    expect(products.find((p) => p.id === "platform")?.name).toBe("EA Tool");
    expect(products.filter((p) => !p.comingSoon).map((p) => p.id)).toEqual([
      "archone",
      "landscape",
      "radar",
    ]);
  });
});

describe("Admin-controlled filter chips", () => {
  it("uses the category names stored in site settings", () => {
    const chips = buildFilterChips(list, { technology: "إدارة التقنيات" });
    expect(chips[0]).toEqual({ id: ALL_CATEGORIES, label: "كل المنتجات", count: 4 });
    expect(chips.find((chip) => chip.id === "technology")).toEqual({
      id: "technology",
      label: "إدارة التقنيات",
      count: 2,
    });
  });
  it("falls back to the raw category id when the admin renamed nothing", () => {
    const chips = buildFilterChips(list, {});
    expect(chips.map((chip) => chip.id)).toContain("architecture");
    expect(chips.find((chip) => chip.id === "architecture")?.label).toBe("architecture");
  });
});

describe("Admin input safety", () => {
  it("rejects color values that are not plain colours", () => {
    expect(isValidColor("#0F172A")).toBe(true);
    expect(isValidColor("oklch(0.52 0.06 154)")).toBe(true);
    expect(isValidColor("url(https://evil/x)")).toBe(false);
    expect(isValidColor("red; } body { display: none }")).toBe(false);
  });
  it("ignores unknown fonts and unsafe colors when building the theme", () => {
    const css = themeCss({
      ...defaultSettings,
      headingFont: "Malicious Font",
      bodyFont: "Tajawal",
      colors: { "--primary": "url(https://evil/x)", "--background": "#FFFFFF" },
    });
    expect(css).toContain('--font-display:"Alexandria"');
    expect(css).toContain('--font-sans:"Tajawal"');
    expect(css).toContain("--background:#FFFFFF");
    expect(css).toContain('[data-surface="site"]{--ea-paper:#FFFFFF}');
    expect(themeCss(defaultSettings)).not.toContain("--ea-paper:");
    expect(css).not.toContain("evil");
  });
});

describe("Site identity defaults", () => {
  it("ships with no Arabic tagline under the site title", () => {
    expect(defaultSettings.arabicTitle).toBe("");
    expect(fallbackCatalog.settings.arabicTitle).toBe("");
  });
});

describe("Product release info on the detail page", () => {
  const row: ProductRow = {
    id: "archone",
    name: "ArchONE",
    category: "architecture",
    label: "البنية المؤسسية",
    description: "نمذجة البنية المؤسسية وتوثيق المكونات والتطبيقات.",
    overview: "وصف كامل",
    features: [],
    url: "https://example.test",
    keywords: "",
    coming_soon: false,
    image_url: "",
    image_alt: "",
    sort_order: 10,
    version: " 2.4.0 ",
    whats_new: "\nلوحة جديدة\nتصدير PDF\n",
  };

  it("keeps the version number trimmed for the product page", () => {
    expect(mapProduct(row).version).toBe("2.4.0");
  });
  it("keeps release notes as separate lines", () => {
    expect(mapProduct(row).whatsNew).toBe("لوحة جديدة\nتصدير PDF");
  });
  it("shows no version when the admin left both fields empty", () => {
    const blank = mapProduct({ ...row, version: "", whats_new: "   " });
    expect(blank.version).toBe("");
    expect(blank.whatsNew).toBe("");
  });
});
