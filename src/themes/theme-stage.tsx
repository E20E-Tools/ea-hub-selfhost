import { Suspense } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { DesignThemeId } from "@/lib/design-themes";
import { useLanguage } from "@/lib/language";
import { THEME_STAGES, type StageProps } from "./registry";
import { useActiveTheme } from "./use-active-theme";

/**
 * Homepage stage for experience themes. The server renders an empty placeholder of the
 * same height (CSS per theme); the lazy stage mounts only after hydration.
 */
export function ThemeStage({ initial, ...props }: StageProps & { initial: DesignThemeId }) {
  const theme = useActiveTheme(initial);
  const hydrated = useHydrated();
  const { t } = useLanguage();
  const Stage = theme === "classic" ? undefined : THEME_STAGES[theme];
  if (!Stage) return null;
  return (
    <section className="theme-stage" data-stage={theme} aria-label={t("stageLabel")}>
      {hydrated ? (
        <Suspense fallback={null}>
          <Stage {...props} />
        </Suspense>
      ) : null}
    </section>
  );
}
