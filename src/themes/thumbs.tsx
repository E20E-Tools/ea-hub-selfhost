import type { ComponentType } from "react";
import type { DesignThemeId } from "@/lib/design-themes";
import { CircuitCoreThumb } from "./circuit-core/thumb";
import { E20eOsThumb } from "./e20e-os/thumb";
import { MetropolisThumb } from "./ea-metropolis/thumb";
import { BlueprintThumb } from "./living-blueprint/thumb";
import { LegacyDigitalThumb } from "./legacy-to-digital/thumb";
import { MashrabiyaThumb } from "./digital-mashrabiya/thumb";
import { GalaxyThumb } from "./e20e-galaxy/thumb";
import { MetroThumb } from "./transformation-metro/thumb";
import { TransformationBoardThumb } from "./transformation-board/thumb";
import { UntangleChaosThumb } from "./untangle-chaos/thumb";
import { RevealLensThumb } from "./reveal-lens/thumb";
import { ProblemToToolThumb } from "./problem-to-tool/thumb";
import { ParticleForgeThumb } from "./particle-forge/thumb";
import { FlipDeckThumb } from "./flip-deck/thumb";
import { EaLayersThumb } from "./ea-layers/thumb";

function ClassicThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="oklch(0.88 0.012 95)" />
      <rect x="16" y="14" width="288" height="18" rx="3" fill="oklch(0.94 0.01 95)" />
      <rect x="24" y="20" width="44" height="6" rx="3" fill="oklch(0.3 0.01 60)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${16 + i * 98} 46)`}>
          <rect
            width="90"
            height="118"
            rx="6"
            fill="oklch(0.95 0.008 95)"
            stroke="oklch(0.8 0.01 90)"
          />
          <rect x="8" y="8" width="74" height="50" rx="3" fill="oklch(0.86 0.02 90)" />
          <rect x="8" y="68" width="50" height="7" rx="3" fill="oklch(0.3 0.01 60)" />
          <rect x="8" y="82" width="70" height="5" rx="2" fill="oklch(0.6 0.01 60)" />
          <rect x="8" y="92" width="60" height="5" rx="2" fill="oklch(0.6 0.01 60)" />
        </g>
      ))}
    </svg>
  );
}

/** Lightweight static posters for the admin picker (no animation, no data). */
export const THEME_THUMBS: Record<DesignThemeId, ComponentType> = {
  classic: ClassicThumb,
  "circuit-core": CircuitCoreThumb,
  "e20e-os": E20eOsThumb,
  "transformation-metro": MetroThumb,
  "e20e-galaxy": GalaxyThumb,
  "digital-mashrabiya": MashrabiyaThumb,
  "legacy-to-digital": LegacyDigitalThumb,
  "living-blueprint": BlueprintThumb,
  "ea-metropolis": MetropolisThumb,
  "transformation-board": TransformationBoardThumb,
  "untangle-chaos": UntangleChaosThumb,
  "reveal-lens": RevealLensThumb,
  "problem-to-tool": ProblemToToolThumb,
  "particle-forge": ParticleForgeThumb,
  "flip-deck": FlipDeckThumb,
  "ea-layers": EaLayersThumb,
};
