import { useCallback, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { useActiveTheme } from "./use-active-theme";
import { ABOUT_IMAGE_URL } from "@/lib/about-art";
import { themedImage, themedLogo } from "./theme-art";

type ArtProduct = {
  id?: string | undefined;
  image?: string | undefined;
  imagePath?: string | undefined;
};

/** Logo, About-picture and product-picture resolvers for the theme currently on screen. */
export function useThemeArt() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const theme = useActiveTheme(catalog.settings.designTheme.theme);
  const custom = catalog.settings.themeCustomizations?.[theme];
  const assetUrls = catalog.settings.themeAssetUrls;
  const urls = useMemo(() => assetUrls ?? {}, [assetUrls]);
  const customLogo = custom?.logo ? (urls[custom.logo] ?? "") : "";
  const customImages = custom?.productImages;
  const logo = useCallback(
    (url: string) => themedLogo(theme, url, customLogo),
    [theme, customLogo],
  );
  const image = useCallback(
    (product: ArtProduct) => {
      const path = product.id ? customImages?.[product.id] : undefined;
      return themedImage(theme, product, path ? (urls[path] ?? "") : "");
    },
    [theme, customImages, urls],
  );
  const aboutPath = custom?.aboutImage;
  const about = (aboutPath ? urls[aboutPath] : "") || ABOUT_IMAGE_URL;
  return { theme, logo, image, about };
}
