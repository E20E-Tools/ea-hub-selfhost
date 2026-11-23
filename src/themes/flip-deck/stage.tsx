import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import { useElementSize, useFrameLoop, useMobile, useStageInspector } from "../stage-kit";
import { legacyFileName } from "../legacy-to-digital/model";
import { FAN_MS, STACK_MS, accentFor, deckSettledAt, fanPose, flipAngle, wave } from "./model";

export default function FlipDeckStage({ products, settings }: StageProps) {
  const { t, dir } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const size = useElementSize(root);
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useStageInspector(list, "fd-inspector");
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  // Manual flips toggle the shown face; true = tool face.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const settled = deckSettledAt(list.length);
  const sign = dir === "rtl" ? -1 : 1;

  useFrameLoop(
    motion.running && !mobile,
    (ms) => {
      list.forEach((p, i) => {
        const el = cards.current[i];
        if (!el) return;
        const time = motion.animate ? ms : settled + 1;
        const pose = fanPose(
          i,
          list.length,
          Math.min(1, Math.max(0, (time - STACK_MS) / FAN_MS)),
          size.w,
        );
        const auto = flipAngle(i, time);
        const m = manual[p.id];
        const angle = m === undefined ? auto : m ? 180 : 0;
        el.style.transform = `translate(-50%, 0) translate(${pose.x * sign}px, ${pose.y + wave(i, time, settled)}px) rotate(${pose.rotate * sign}deg) rotateY(${angle}deg)`;
      });
    },
    [list, size.w, motion.animate, manual, mobile, sign],
  );

  const flip = (id: string, shownTool: boolean) => setManual((m) => ({ ...m, [id]: !shownTool }));

  return (
    <div ref={root} className="fd-stage" dir={dir} data-mobile={mobile ? "" : undefined}>
      <h2 className="fd-title">{settings.displayTitle}</h2>
      <p className="fd-hint">{t("fdHint")}</p>
      <div className="fd-deck" role="list">
        {list.map((product, i) => {
          const m = manual[product.id];
          const toolShown = m ?? (mobile ? false : true);
          const style = { "--fd-accent": accentFor(i), zIndex: list.length - i } as CSSProperties;
          return (
            <div
              key={product.id}
              role="listitem"
              className="fd-card"
              data-flipped={mobile && toolShown ? "" : undefined}
              ref={(el) => {
                cards.current[i] = el;
              }}
              style={style}
            >
              <div className="fd-face fd-back" aria-hidden={toolShown}>
                <span className="fd-back-kind">{t("fdBack")}</span>
                <span className="fd-back-file" dir="ltr">
                  {legacyFileName(product)}
                </span>
              </div>
              <div className="fd-face fd-front" aria-hidden={!toolShown}>
                <span className="fd-icon" aria-hidden="true" />
                <strong className="fd-name" dir="ltr">
                  {product.name}
                </strong>
                <span className="fd-desc">{product.description}</span>
                <span className="fd-status" data-soon={product.comingSoon ? "" : undefined}>
                  {product.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}
                </span>
                <button
                  type="button"
                  className="fd-open"
                  tabIndex={toolShown ? 0 : -1}
                  onClick={(e) => inspector.open(product.id, e.currentTarget)}
                >
                  {t("details")}
                </button>
              </div>
              <button
                type="button"
                className="fd-flip"
                aria-label={fill(t("fdFlip"), product.name)}
                aria-pressed={toolShown}
                onClick={() => flip(product.id, toolShown)}
              />
            </div>
          );
        })}
      </div>
      {inspector.panel}
    </div>
  );
}
