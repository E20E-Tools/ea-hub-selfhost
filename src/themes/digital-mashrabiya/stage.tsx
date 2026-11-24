import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Product } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import type { Language } from "@/lib/language-core";
import { fill } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import {
  gridComposition,
  khatam,
  pointedArch,
  polygon,
  ringComposition,
  starPoints,
  tessellationTile,
  toPath,
  tracePath,
  type P,
} from "./geometry";

const REVEAL_KEY = "e20e-mashrabiya-revealed";

function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

function shortDate(date: string, language: Language): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  return new Intl.DateTimeFormat(
    language === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
    {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    },
  ).format(at);
}

const STAR_UNIT = toPath(khatam(50, 50, 48));
const STAR_INNER = toPath(khatam(50, 50, 40, -Math.PI / 2 + Math.PI / 8));
const OCT_UNIT = toPath(polygon(50, 50, 30, 8));
const BULLET = toPath(khatam(6, 6, 6));
const ARCH = pointedArch(0.42);

function Rosette({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path d={toPath(starPoints(20, 20, 19, 11, 8))} />
      <path d={toPath(polygon(20, 20, 8, 8))} />
      <circle cx="20" cy="20" r="3" />
    </svg>
  );
}

function ManuscriptBody({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  return (
    <div className="dm-ms-body">
      <div className="dm-ms-arch" style={{ clipPath: ARCH }}>
        <img src={product.image} alt={product.imageAlt} />
      </div>
      <span className="dm-ms-cat">{product.label}</span>
      <strong className="dm-ms-name" dir="ltr">
        {product.name}
      </strong>
      <p className="dm-ms-status" data-soon={facts.available ? undefined : ""}>
        {facts.status}
        {facts.launch ? ` · ${facts.launch}` : ""}
        {facts.countdown ? ` · ${facts.countdown}` : ""}
      </p>
      <p className="dm-ms-desc">{product.description}</p>
      {facts.features.length ? (
        <ul className="dm-ms-features">
          {facts.features.map((f) => (
            <li key={f}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d={BULLET} />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      <InspectorActions
        product={product}
        className="dm-ms-actions"
        details={t("details")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

export default function MashrabiyaStage({ products, settings }: StageProps) {
  const { t, language, dir } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const rtl = dir === "rtl";
  const list = products.slice(0, 12);
  const comp = useMemo(
    () =>
      mobile
        ? gridComposition(list.length, rtl)
        : ringComposition(list.length, rtl),
    [list.length, mobile, rtl],
  );
  const inspector = useProductInspector();
  const [hot, setHot] = useState<string | null>(null);
  const [reveal, setReveal] = useState<"closed" | "opening" | "done">("closed");

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(REVEAL_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (seen || !motion.animate) return setReveal("done");
    const start = window.setTimeout(
      () => setReveal("opening"),
      mobile ? 250 : 650,
    );
    return () => window.clearTimeout(start);
  }, [motion.animate, mobile]);
  const finishReveal = () => {
    setReveal("done");
    try {
      window.sessionStorage.setItem(REVEAL_KEY, "1");
    } catch {
      /* storage blocked */
    }
  };
  useEffect(() => {
    if (reveal !== "opening") return;
    const id = window.setTimeout(finishReveal, mobile ? 1100 : 2000);
    return () => window.clearTimeout(id);
  }, [reveal, mobile]);

  const lattice = useMemo(() => {
    const d = tessellationTile(84);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'><path d='${d}' fill='none' stroke='#3a2310' stroke-width='9' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#8a5a2b' stroke-width='6' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='#d4a64a' stroke-width='1.6' stroke-linejoin='round' transform='translate(-0.8 -0.8)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, []);

  const paths = useMemo(
    () =>
      comp.tiles.map((tile, i) => {
        const above = mobile && i >= 2 ? comp.tiles[i - 2] : undefined;
        if (above)
          return toPath(
            [
              [above.x, above.y],
              [tile.x, tile.y],
            ],
            false,
          );
        const ang = Math.atan2(tile.y - comp.cy, tile.x - comp.cx);
        const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const from: P = [
          comp.cx + comp.medallion * 0.92 * Math.cos(snapped),
          comp.cy + comp.medallion * 0.92 * Math.sin(snapped),
        ];
        return toPath(tracePath(from, [tile.x, tile.y]), false);
      }),
    [comp, mobile],
  );

  const openProduct = list.find((p) => p.id === inspector.openId) ?? null;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const m = comp.medallion;

  return (
    <div
      ref={root}
      className="dm-stage"
      data-mobile={mobile ? "" : undefined}
      data-hot={hot ?? undefined}
      data-reveal={reveal}
      data-static={motion.animate ? undefined : ""}
      style={{ "--dm-lattice": lattice } as CSSProperties}
    >
      <div className="dm-intro">
        <p className="dm-eyebrow">{t("dmEyebrow")}</p>
        <p className="dm-title" aria-hidden="true">
          {settings.displayTitle}
        </p>
        {settings.tagline ? (
          <p className="dm-tagline">{settings.tagline}</p>
        ) : null}
      </div>

      <div
        className="dm-art"
        dir="ltr"
        style={{ aspectRatio: `${comp.w} / ${comp.h}` }}
        role="group"
        aria-label={t("dmComposition")}
      >
        <svg
          viewBox={`0 0 ${comp.w} ${comp.h}`}
          className="dm-svg"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="dm-tess"
              width="64"
              height="64"
              patternUnits="userSpaceOnUse"
              x={comp.cx - 32}
              y={comp.cy - 32}
            >
              <path d={tessellationTile(64)} className="dm-tess-line" />
            </pattern>
            <radialGradient id="dm-glow">
              <stop
                offset="0"
                stopColor="var(--dm-gold-2)"
                stopOpacity="0.35"
              />
              <stop offset="1" stopColor="var(--dm-gold)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={comp.w} height={comp.h} fill="url(#dm-tess)" />
          <circle cx={comp.cx} cy={comp.cy} r={m * 2.4} fill="url(#dm-glow)" />
          {paths.map((d, i) => {
            const p = list[i];
            if (!p) return null;
            const state = hot ? (hot === p.id ? "hot" : "dim") : undefined;
            return (
              <g
                key={p.id}
                className="dm-path"
                data-state={state}
                data-soon={p.comingSoon ? "" : undefined}
              >
                <path d={d} className="dm-path-bed" />
                <path d={d} className="dm-path-line" />
                <path
                  d={d}
                  pathLength={100}
                  className="dm-pulse"
                  style={{ animationDelay: `${(i * 0.37) % 2}s` }}
                />
              </g>
            );
          })}
          <g className="dm-medallion">
            <g
              className="dm-rot dm-rot-outer"
              style={{ transformOrigin: `${comp.cx}px ${comp.cy}px` }}
            >
              <path
                d={toPath(starPoints(comp.cx, comp.cy, m, m * 0.86, 16))}
                className="dm-med-rosette"
              />
              {Array.from({ length: 16 }, (_, k) => {
                const a = (k * Math.PI) / 8;
                return (
                  <circle
                    key={k}
                    cx={comp.cx + m * 0.93 * Math.cos(a)}
                    cy={comp.cy + m * 0.93 * Math.sin(a)}
                    r={m * 0.025}
                    className="dm-med-dot"
                  />
                );
              })}
            </g>
            <path
              d={toPath(polygon(comp.cx, comp.cy, m * 0.8, 8))}
              className="dm-med-oct"
            />
            <g
              className="dm-rot dm-rot-inner"
              style={{ transformOrigin: `${comp.cx}px ${comp.cy}px` }}
            >
              <path
                d={toPath(khatam(comp.cx, comp.cy, m * 0.74))}
                className="dm-med-star"
              />
              <path
                d={toPath(
                  khatam(comp.cx, comp.cy, m * 0.6, -Math.PI / 2 + Math.PI / 8),
                )}
                className="dm-med-star2"
              />
            </g>
            <circle
              cx={comp.cx}
              cy={comp.cy}
              r={m * 0.42}
              className="dm-med-core"
            />
            {settings.logoUrl ? (
              <image
                href={settings.logoUrl}
                x={comp.cx - m * 0.34}
                y={comp.cy - m * 0.34}
                width={m * 0.68}
                height={m * 0.68}
              />
            ) : null}
          </g>
        </svg>
        <div className="dm-light" aria-hidden="true" />

        {list.map((p, i) => {
          const tile = comp.tiles[i];
          if (!tile) return null;
          return (
            <button
              key={p.id}
              type="button"
              className="dm-tile"
              data-soon={p.comingSoon ? "" : undefined}
              data-hot={hot === p.id ? "" : undefined}
              data-selected={inspector.openId === p.id ? "" : undefined}
              style={{
                left: pct(tile.x, comp.w),
                top: pct(tile.y, comp.h),
                width: pct(tile.size, comp.w),
              }}
              aria-label={`${p.name} — ${p.label} — ${p.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}`}
              aria-expanded={inspector.openId === p.id}
              onPointerEnter={() => setHot(p.id)}
              onPointerLeave={() => setHot(null)}
              onFocus={() => setHot(p.id)}
              onBlur={() => setHot(null)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) =>
                inspector.openId === p.id
                  ? inspector.close()
                  : inspector.open(p.id, e.currentTarget)
              }
            >
              <svg
                viewBox="0 0 100 100"
                className="dm-tile-svg"
                aria-hidden="true"
              >
                <g className="dm-ripple">
                  <path d={OCT_UNIT} />
                  <path d={OCT_UNIT} />
                </g>
                <g className="dm-tile-star">
                  <path d={STAR_UNIT} className="dm-tile-frame" />
                  <path d={STAR_INNER} className="dm-tile-inner" />
                </g>
              </svg>
              <span className="dm-tile-text" dir={dir}>
                <strong dir="ltr">{p.name}</strong>
                <small>{p.label}</small>
              </span>
              {p.comingSoon ? (
                <span className="dm-crescent" dir={dir}>
                  {p.publicationDate
                    ? fill(
                        t("dmSoonOn"),
                        shortDate(p.publicationDate, language),
                      )
                    : t("dmSoon")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {reveal !== "done" ? (
        <div className="dm-lattice" aria-hidden="true" onClick={finishReveal}>
          <span className="dm-lattice-glow" />
          <span className="dm-door dm-door-a" />
          <span className="dm-door dm-door-b" />
        </div>
      ) : null}
      {reveal !== "done" ? (
        <button type="button" className="dm-skip" onClick={finishReveal}>
          {t("dmSkip")}
        </button>
      ) : null}

      {openProduct ? (
        <InspectorPanel
          product={openProduct}
          className="dm-manuscript"
          onClose={inspector.close}
          title={<span>{openProduct.label}</span>}
        >
          <span className="dm-bloom" aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <path d={STAR_UNIT} />
            </svg>
          </span>
          <Rosette className="dm-corner dm-corner-tl" />
          <Rosette className="dm-corner dm-corner-tr" />
          <Rosette className="dm-corner dm-corner-bl" />
          <Rosette className="dm-corner dm-corner-br" />
          <ManuscriptBody product={openProduct} />
        </InspectorPanel>
      ) : null}
    </div>
  );
}
