import type { DesignThemeId } from "@/lib/design-themes";
import tbLogo from "./transformation-board/art/logo.png.asset.json";
import tbArchone from "./transformation-board/art/archone.jpg.asset.json";
import tbInnovation from "./transformation-board/art/innovation.jpg.asset.json";
import tbItfm from "./transformation-board/art/itfm.jpg.asset.json";
import tbLandscape from "./transformation-board/art/landscape.jpg.asset.json";
import tbPlatform from "./transformation-board/art/platform.jpg.asset.json";
import tbRadar from "./transformation-board/art/radar.jpg.asset.json";

/**
 * Recoloured copies of the shared logo and product pictures for one theme.
 * Each copy is keyed by the storage path it was made from, so a new upload in
 * the admin always wins over a stale recolour.
 */
type ThemeArt = {
  logo: { source: string; url: string };
  products: Readonly<Record<string, string>>;
};

export const THEME_ART: Partial<Record<DesignThemeId, ThemeArt>> = {
  "transformation-board": {
    logo: { source: "branding/07233eca-fed8-40d5-9c19-0fefad5fdf85.png", url: tbLogo.url },
    products: {
      "products/archone.jpg": tbArchone.url,
      "products/innovation.jpg": tbInnovation.url,
      "products/itfm.jpg": tbItfm.url,
      "products/landscape.jpg": tbLandscape.url,
      "products/platform.jpg": tbPlatform.url,
      "products/radar.jpg": tbRadar.url,
    },
  },
};

/**
 * Theme's logo: an admin's per-design upload (`override`) wins, then the theme's
 * recoloured copy when the site still uses the logo it was made from.
 */
export function themedLogo(theme: DesignThemeId, logoUrl: string, override = ""): string {
  if (override) return override;
  const art = THEME_ART[theme];
  if (!art || !logoUrl) return logoUrl;
  return logoUrl.includes(art.logo.source) ? art.logo.url : logoUrl;
}

/** Per-design upload first, then the theme's recolour of the original upload. */
export function themedImage(
  theme: DesignThemeId,
  product: { image?: string | undefined; imagePath?: string | undefined },
  override = "",
): string {
  if (override) return override;
  const path = product.imagePath ?? "";
  return (path && THEME_ART[theme]?.products[path]) || product.image || "";
}
