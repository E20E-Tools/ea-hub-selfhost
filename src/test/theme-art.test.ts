import { describe, expect, it } from "vitest";
import { THEME_ART, themedImage, themedLogo } from "@/themes/theme-art";

const signedLogo =
  "https://example.test/storage/v1/object/sign/site-assets/branding/07233eca-fed8-40d5-9c19-0fefad5fdf85.png?token=abc";
const ids = ["archone", "innovation", "itfm", "landscape", "platform", "radar"];

describe("Transformation Board recoloured art", () => {
  it("has a recoloured picture for each of the six products", () => {
    const products = THEME_ART["transformation-board"]?.products ?? {};
    expect(Object.keys(products).sort()).toEqual(
      ids.map((id) => `products/${id}.jpg`),
    );
  });

  it("uses the new circuit logo for the platform", () => {
    expect(THEME_ART["transformation-board"]?.logo.url).toBe(
      "/__l5e/assets-v1/ceaafeb7-1b0f-45fd-99de-322150b6994a/e20e-logo-circuit.png",
    );
  });

  it("swaps the logo only for the logo it was made from", () => {
    const art = THEME_ART["transformation-board"];
    expect(themedLogo("transformation-board", signedLogo)).toBe(art?.logo.url);
    expect(
      themedLogo(
        "transformation-board",
        "https://x.test/branding/new-upload.png",
      ),
    ).toBe("https://x.test/branding/new-upload.png");
    expect(themedLogo("transformation-board", "")).toBe("");
  });

  it("swaps product pictures only while the original upload is in use", () => {
    const recoloured =
      THEME_ART["transformation-board"]?.products["products/radar.jpg"];
    expect(
      themedImage("transformation-board", {
        image: "signed",
        imagePath: "products/radar.jpg",
      }),
    ).toBe(recoloured);
    expect(
      themedImage("transformation-board", {
        image: "signed",
        imagePath: "products/radar-v2.jpg",
      }),
    ).toBe("signed");
  });

  it("leaves Classic and the other themes on the original art", () => {
    expect(themedLogo("classic", signedLogo)).toBe(signedLogo);
    expect(themedLogo("legacy-to-digital", signedLogo)).toBe(signedLogo);
    expect(
      themedImage("circuit-core", {
        image: "signed",
        imagePath: "products/radar.jpg",
      }),
    ).toBe("signed");
  });
});
