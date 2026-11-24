import { useMemo, useRef, useState } from "react";
import { FeatureOnly } from "@/components/feature-gate";
import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  LEGACY_DESKTOP_FILES,
  legacyFileName,
} from "../legacy-to-digital/model";
import { dictionaries } from "@/lib/copy";

/** Planet placement on the orbit ellipse, as % of the orbit box. */
export function orbitSpot(i: number, count: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, count);
  return { x: 50 + 44 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
}

export default function OrbitalPortalStage({ products, settings }: StageProps) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const [pct, setPct] = useState(60);
  const list = useMemo(() => products.slice(0, 8), [products]);
  const liveCount = Math.round((pct / 100) * list.length);
  const debris = [
    ...list.slice(liveCount).map((p) => legacyFileName(p)),
    ...LEGACY_DESKTOP_FILES.slice(
      0,
      Math.max(0, 3 - (list.length - liveCount)),
    ),
  ].slice(0, 5);
  const available = products.filter((p) => !p.comingSoon).length;

  return (
    <div
      ref={root}
      className="orb-stage"
      data-motion={motion.animate ? "on" : "off"}
      data-paused={motion.running ? undefined : ""}
    >
      <div className="orb-stars" aria-hidden="true" />
      <div className="orb-copy">
        <span className="orb-pill">
          <i />
          {ar
            ? `${available} أدوات متاحة الآن · ${products.length - available} قريبًا`
            : `${available} tools live · ${products.length - available} coming soon`}
        </span>
        <h1>{settings.displayTitle}</h1>
        <p className="orb-lead">
          {settings.tagline ||
            dictionaries[ar ? "ar" : "en"].stageEverythingScatteredAcrossYour}
        </p>
        <div className="orb-actions">
          <FeatureOnly feature="discover">
            <a href="/discover" className="orb-cta">
              {dictionaries[ar ? "ar" : "en"].ldStartCta}
            </a>
          </FeatureOnly>
          <a href="#catalog" className="orb-ghost">
            {dictionaries[ar ? "ar" : "en"].stageExploreTheOrbit}
          </a>
        </div>
        <label className="orb-dial">
          <span dir="ltr">LEGACY</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label={dictionaries[ar ? "ar" : "en"].stageTransformationLevel}
            aria-valuetext={`${pct}%`}
            style={{ ["--fill" as string]: `${pct}%` }}
          />
          <span dir="ltr">DIGITAL</span>
        </label>
      </div>

      <div className="orb-visual">
        <div className="orb-plane" aria-hidden="true">
          <i className="orb-ring orb-ring-1" />
          <i className="orb-ring orb-ring-2" />
          <i className="orb-ring orb-ring-3" />
        </div>
        <div
          className="orb-core"
          style={{ ["--deg" as string]: `${pct * 3.6}deg` }}
        >
          <strong dir="ltr">{pct}%</strong>
          <small>{dictionaries[ar ? "ar" : "en"].stageTransformed}</small>
        </div>
        {list.map((p, i) => {
          const spot = orbitSpot(i, list.length);
          const live = i < liveCount;
          return (
            <Link
              key={p.id}
              to="/product/$productId"
              params={{ productId: p.id }}
              className="orb-planet"
              data-live={live ? "" : undefined}
              data-soon={p.comingSoon ? "" : undefined}
              style={{
                // Keep the whole pill inside the stage on narrow screens.
                left: `clamp(var(--orb-edge), ${spot.x}%, calc(100% - var(--orb-edge)))`,
                top: `${spot.y}%`,
                animationDelay: `${-i * 0.9}s`,
              }}
            >
              <i aria-hidden="true" />
              <span>
                <b dir="ltr">{p.name}</b>
                <small>
                  {live
                    ? p.label
                    : dictionaries[ar ? "ar" : "en"].stageEnteringOrbit}
                </small>
              </span>
            </Link>
          );
        })}
        <div className="orb-debris" aria-hidden="true">
          {debris.map((name, i) => (
            <span
              key={name}
              style={{ animationDelay: `${-i * 1.1}s`, top: `${14 + i * 17}%` }}
              dir="ltr"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
