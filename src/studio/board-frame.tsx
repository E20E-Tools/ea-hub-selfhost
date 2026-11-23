import { ThemeStage } from "@/themes/theme-stage";
import { useThemeArt } from "@/themes/use-theme-art";
import { useLanguage } from "@/lib/language";
import type { Product, SiteSettings } from "@/lib/catalog";
export function BoardFrame({
  products,
  settings,
}: {
  products: Product[];
  settings: SiteSettings;
}) {
  const { t } = useLanguage();
  const { theme } = useThemeArt();
  if (theme === "classic") return null;
  return (
    <section
      id="board"
      className="s-board nx-board"
      aria-label={t("stageLabel")}
    >
      <ThemeStage
        initial={settings.designTheme.theme}
        products={products}
        settings={settings}
      />
    </section>
  );
}
