import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedSettings } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { useThemeArt } from "@/themes/use-theme-art";

/**
 * The design's own platform logo, linked home. It only appears when the
 * active design ships its logo, so other designs keep their pages unchanged.
 */
export function PlatformMark({ className }: { className?: string }) {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language } = useLanguage();
  const art = useThemeArt();
  const settings = localizedSettings(catalog.settings, language);
  const logo = art.logo(settings.logoUrl);
  if (!logo || logo === settings.logoUrl) return null;
  return (
    <Link
      to="/"
      className={className ? `platform-mark ${className}` : "platform-mark"}
      aria-label={settings.displayTitle}
    >
      <img src={logo} alt="" width={160} height={46} />
    </Link>
  );
}
