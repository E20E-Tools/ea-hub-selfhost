import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { DesignThemeId } from "@/lib/design-themes";
import type { Product, SiteSettings } from "@/lib/catalog";

export type StageProps = {
  /** Localized live-catalog products, available first then coming soon. */
  products: Product[];
  /** Localized site settings (title, tagline, logo). */
  settings: SiteSettings;
};

/** Homepage stages, code-split so Classic visitors download none of them. */
export const THEME_STAGES: Partial<
  Record<DesignThemeId, LazyExoticComponent<ComponentType<StageProps>>>
> = {
  "circuit-core": lazy(() => import("./circuit-core/stage")),
  "e20e-os": lazy(() => import("./e20e-os/stage")),
  "ea-metropolis": lazy(() => import("./ea-metropolis/stage")),
  "living-blueprint": lazy(() => import("./living-blueprint/stage")),
  "legacy-to-digital": lazy(() => import("./legacy-to-digital/stage")),
  "digital-mashrabiya": lazy(() => import("./digital-mashrabiya/stage")),
  "e20e-galaxy": lazy(() => import("./e20e-galaxy/stage")),
  "transformation-metro": lazy(() => import("./transformation-metro/stage")),
  "transformation-board": lazy(() => import("./transformation-board/stage")),
  "untangle-chaos": lazy(() => import("./untangle-chaos/stage")),
  "reveal-lens": lazy(() => import("./reveal-lens/stage")),
  "problem-to-tool": lazy(() => import("./problem-to-tool/stage")),
  "particle-forge": lazy(() => import("./particle-forge/stage")),
  "flip-deck": lazy(() => import("./flip-deck/stage")),
  "ea-layers": lazy(() => import("./ea-layers/stage")),
  "time-scanner": lazy(() => import("./time-scanner/stage")),
  "orbital-portal": lazy(() => import("./orbital-portal/stage")),
  "terminal-migration": lazy(() => import("./terminal-migration/stage")),
};

export function hasStage(id: DesignThemeId): boolean {
  return id !== "classic" && Boolean(THEME_STAGES[id]);
}
