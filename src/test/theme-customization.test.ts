import { describe, expect, it } from "vitest";
import {
  customizationPaths,
  normalizeThemeCustomizations,
  saveThemeCustomizationSchema,
  themeCustomizationCss,
} from "@/lib/theme-customization";
import { mapSettings, themeCss, defaultSettings } from "@/lib/catalog";
import { themedImage, themedLogo } from "@/themes/theme-art";

describe("per-design customisation", () => {
  it("keeps each design's colours scoped to that design only", () => {
    const css = themeCustomizationCss(
      {
        "circuit-core": {
          colors: { "--primary": "#ff0000" },
          sizes: {},
          logo: "",
          background: "",
          productImages: {},
        },
      },
      {},
    );
    expect(css).toContain(
      ':root:root:root[data-design-theme="circuit-core"]:not([data-theme-defaults]){--primary:#ff0000}',
    );
    expect(css).not.toContain('"classic"');
  });

  it("turns sizes into visitor-only rules", () => {
    const css = themeCustomizationCss(
      {
        classic: {
          colors: {},
          sizes: { logo: 0.65, text: 1.1, cards: 0.8, header: 20 },
          logo: "",
          background: "",
          productImages: {},
        },
      },
      {},
    );
    expect(css).toContain('[data-surface="site"] .site-brand{zoom:0.65}');
    expect(css).toContain('[data-surface="site"] :is(.site-content,.site-footer){zoom:1.1}');
    expect(css).toContain(
      ".product-grid{grid-template-columns:repeat(3,minmax(0,1fr));max-width:80%;margin-inline:auto}",
    );
    expect(css).toContain("grid-auto-columns:minmax(min(185.6px,88vw),min(60.8vw,88vw))");
    expect(css).toContain('[data-surface="site"] .site-header{padding-block:20px}');
  });

  it("only uses a background picture with a safe signed address", () => {
    const entry = {
      colors: {},
      sizes: {},
      logo: "",
      background: "branding/bg.jpg",
      productImages: {},
    };
    expect(
      themeCustomizationCss(
        { classic: entry },
        { "branding/bg.jpg": "https://x.test/a.jpg?token=abc" },
      ),
    ).toContain('url("https://x.test/a.jpg?token=abc")');
    expect(
      themeCustomizationCss(
        { classic: entry },
        { "branding/bg.jpg": 'https://x.test/a.jpg")}body{color:red' },
      ),
    ).not.toContain("url(");
  });

  it("drops unknown designs, bad colours and empty entries when reading saved data", () => {
    const map = normalizeThemeCustomizations({
      nope: { colors: { "--primary": "#000" } },
      classic: { colors: { "--primary": "red;}" } },
      "e20e-os": {},
      "e20e-galaxy": { sizes: { logo: 1.2 } },
    });
    expect(Object.keys(map)).toEqual(["e20e-galaxy"]);
    expect(map["e20e-galaxy"]?.sizes.logo).toBe(1.2);
  });

  it("rejects out-of-range sizes and outside picture paths on save", () => {
    const ok = { theme: "classic", value: { sizes: { logo: 0.65 }, logo: "branding/a.png" } };
    expect(saveThemeCustomizationSchema.safeParse(ok).success).toBe(true);
    expect(
      saveThemeCustomizationSchema.safeParse({ theme: "classic", value: { sizes: { logo: 3 } } })
        .success,
    ).toBe(false);
    expect(
      saveThemeCustomizationSchema.safeParse({ theme: "classic", value: { logo: "../secret.png" } })
        .success,
    ).toBe(false);
    expect(saveThemeCustomizationSchema.safeParse({ theme: "unknown", value: {} }).success).toBe(
      false,
    );
  });

  it("lists every picture path for signing", () => {
    expect(
      customizationPaths({
        classic: {
          colors: {},
          sizes: {},
          logo: "branding/l.png",
          background: "branding/b.jpg",
          productImages: { radar: "products/r.jpg" },
        },
      }).sort(),
    ).toEqual(["branding/b.jpg", "branding/l.png", "products/r.jpg"]);
  });

  it("adds saved design rules to the site's styles", () => {
    const settings = mapSettings({
      display_title: "x",
      arabic_title: "",
      description: "",
      logo_url: "",
      heading_font: "Alexandria",
      body_font: "Alexandria",
      categories: {},
      colors: {},
      theme_customizations: { classic: { sizes: { cards: 1.2 } } },
    });
    // Larger cards: two columns, each 1.2x the design's own third-of-a-row card.
    expect(themeCss(settings)).toContain("repeat(2,minmax(0,1fr));max-width:80%");
    expect(themeCss(defaultSettings)).not.toContain("product-grid");
  });

  it("lets a per-design upload win over the design's recoloured logo and pictures", () => {
    const original = "https://cdn.test/branding/07233eca-fed8-40d5-9c19-0fefad5fdf85.png";
    expect(themedLogo("transformation-board", original)).not.toBe(original);
    expect(themedLogo("transformation-board", original, "https://cdn.test/mine.png")).toBe(
      "https://cdn.test/mine.png",
    );
    const product = { image: "https://cdn.test/radar.jpg", imagePath: "products/radar.jpg" };
    expect(themedImage("transformation-board", product, "https://cdn.test/new.jpg")).toBe(
      "https://cdn.test/new.jpg",
    );
    expect(themedImage("classic", product)).toBe("https://cdn.test/radar.jpg");
  });

  it("keeps a design's own About page picture and signs it with the other pictures", () => {
    const map = normalizeThemeCustomizations({
      "e20e-os": { aboutImage: "branding/about.jpg" },
      classic: { aboutImage: "" },
    });
    expect(Object.keys(map)).toEqual(["e20e-os"]);
    expect(map["e20e-os"]?.aboutImage).toBe("branding/about.jpg");
    expect(customizationPaths(map)).toEqual(["branding/about.jpg"]);
    expect(
      saveThemeCustomizationSchema.safeParse({
        theme: "classic",
        value: { aboutImage: "https://evil.test/x.jpg" },
      }).success,
    ).toBe(false);
  });
});
