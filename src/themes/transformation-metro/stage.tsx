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
import { countdownParts, launchInstant } from "../launch";
import {
  layoutBoxes,
  metroLayout,
  pointAt,
  type LayoutBranch,
  type Pt,
} from "./layout";
import { metroInk, metroLines } from "./lines";
import { flapGlyph, hasArabic, splitFlapUnits } from "./flap";

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
      month: language === "ar" ? "long" : "short",
      timeZone: "UTC",
    },
  ).format(at);
}

function d(points: Pt[]): string {
  return points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
}

/** Splits a polyline at a distance: [service part, construction part]. */
function splitAt(points: Pt[], len: number): [Pt[], Pt[]] {
  if (len <= 0) return [[], points];
  const a: Pt[] = [points[0] as Pt];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1] as Pt;
    const q = points[i] as Pt;
    const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (acc + seg >= len) {
      const cut = pointAt(points, len);
      const c: Pt = [cut.x, cut.y];
      a.push(c);
      return [a, [c, ...points.slice(i)]];
    }
    acc += seg;
    a.push(q);
  }
  return [a, []];
}

/** Split-flap text: Latin cycles per character, Arabic per whole word. */
function FlapText({
  text,
  animate,
  delay = 0,
}: {
  text: string;
  animate: boolean;
  delay?: number;
}) {
  const units = useMemo(() => splitFlapUnits(text), [text]);
  const arabic = hasArabic(text);
  const pool = useMemo(
    () => (arabic ? units.filter((u) => u.trim()) : []),
    [units, arabic],
  );
  const stride = arabic ? 1 : Math.min(1, 28 / Math.max(1, units.length));
  const last = Math.ceil((units.length - 1) * stride) + 5;
  const [step, setStep] = useState(animate ? -Math.round(delay / 55) : last);
  useEffect(() => {
    if (!animate) return setStep(last);
    setStep(-Math.round(delay / 55));
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= last) window.clearInterval(id);
        return s + 1;
      });
    }, 55);
    return () => window.clearInterval(id);
  }, [animate, text, delay, last]);
  return (
    <span
      className="tm-flap"
      aria-label={text}
      role="text"
      dir={arabic ? "rtl" : "ltr"}
    >
      {units.map((u, i) => {
        if (!u.trim())
          return <span key={i} className="tm-flap-gap" aria-hidden="true" />;
        const settle = Math.ceil(i * stride) + 4;
        const blank = step < Math.ceil(i * stride);
        const glyph = blank
          ? " "
          : step < settle
            ? flapGlyph(i + step, pool)
            : u;
        return (
          <span
            key={`${i}-${glyph}`}
            className="tm-flap-cell"
            data-word={arabic ? "" : undefined}
            aria-hidden="true"
            data-settled={glyph === u ? "" : undefined}
          >
            {glyph}
          </span>
        );
      })}
    </span>
  );
}

function BoardBody({
  product,
  badge,
  color,
  animate,
}: {
  product: Product;
  badge: string;
  color: string;
  animate: boolean;
}) {
  const { t, language } = useLanguage();
  const facts = useInspectorFacts(product);
  const status = facts.available
    ? t("tmInServiceStatus")
    : product.publicationDate
      ? fill(t("tmOpening"), shortDate(product.publicationDate, language))
      : t("tmOpeningSoon");
  const up = (s: string) => (language === "ar" ? s : s.toUpperCase());
  return (
    <div className="tm-board-body">
      <dl className="tm-board-rows">
        <div>
          <dt>{t("tmStation")}</dt>
          <dd>
            <FlapText text={up(product.name)} animate={animate} />
          </dd>
        </div>
        <div>
          <dt>{t("tmLine")}</dt>
          <dd>
            <span
              className="tm-roundel"
              style={
                {
                  "--line": color,
                  "--line-ink": metroInk(color),
                } as CSSProperties
              }
              aria-hidden="true"
            >
              {badge}
            </span>
            <FlapText text={up(product.label)} animate={animate} delay={180} />
          </dd>
        </div>
        <div>
          <dt>{t("tmStatus")}</dt>
          <dd data-soon={facts.available ? undefined : ""}>
            <FlapText text={up(status)} animate={animate} delay={360} />
            {facts.countdown ? (
              <small className="tm-board-count">{facts.countdown}</small>
            ) : null}
          </dd>
        </div>
      </dl>
      {facts.features.length ? (
        <div className="tm-board-stops">
          <span className="tm-board-key">{t("tmStops")}</span>
          <ol>
            {facts.features.map((f, i) => (
              <li key={f}>
                <i style={{ background: color }} aria-hidden="true" />
                <FlapText text={f} animate={animate} delay={480 + i * 120} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <InspectorActions
        product={product}
        className="tm-board-actions"
        details={t("tmBoard")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

type Train = {
  branch: LayoutBranch;
  stops: number[];
  stationIds: (string | null)[];
};

export default function TransformationMetroStage({
  products,
  settings,
}: StageProps) {
  const { t, language, dir } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const list = products.slice(0, 12);
  const lines = useMemo(() => metroLines(list), [list]);
  const key = list
    .map((p) => [p.id, p.name, p.category, p.comingSoon].join("~"))
    .join("|");
  const layout = useMemo(
    () =>
      metroLayout(
        lines.map((l) => ({
          category: l.category,
          stations: list
            .filter((p) => p.category === l.category)
            .map((p) => ({
              id: p.id,
              name: p.name,
              soon: Boolean(p.comingSoon),
            })),
        })),
        mobile,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, mobile],
  );
  // Crop the canvas to what is drawn so the map fills the stage.
  const view = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const b of layoutBoxes(layout)) {
      xs.push(b.x, b.x + b.w);
      ys.push(b.y - 20, b.y + b.h + 20);
    }
    for (const l of layout.lines)
      for (const br of l.branches)
        for (const [x, y] of br.points) {
          xs.push(x);
          ys.push(y);
        }
    for (const h of layout.headers ?? []) {
      xs.push(h.x - 14);
      ys.push(h.y - 14);
    }
    const pad = mobile ? 10 : 40;
    const x = mobile ? 0 : Math.max(0, Math.min(...xs) - pad);
    const y = Math.max(0, Math.min(...ys) - pad);
    const w = mobile ? layout.w : Math.min(layout.w, Math.max(...xs) + pad) - x;
    const h = Math.min(layout.h, Math.max(...ys) + pad) - y;
    return { x, y, w, h };
  }, [layout, mobile]);
  const byId = new Map(list.map((p) => [p.id, p]));
  const lineOf = (category: string) =>
    lines.find((l) => l.category === category);
  const inspector = useProductInspector();
  const [hover, setHover] = useState<{
    category: string;
    productId?: string;
  } | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const hot = hover?.category ?? pinned;

  // Ticker (real data only).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const ticker = useMemo(() => {
    const items: string[] = [];
    const next = list
      .filter((p) => p.comingSoon)
      .map((p) => ({ p, at: launchInstant(p) }))
      .filter((x): x is { p: Product; at: Date } => Boolean(x.at && x.at > now))
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (next?.p.publicationDate) {
      const parts = countdownParts(next.at, now);
      const date = new Intl.DateTimeFormat(
        language === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Riyadh",
        },
      ).format(next.at);
      items.push(
        fill(
          t("tmNextOpening"),
          [
            next.p.name,
            date,
            parts ? fill(t("tmInDays"), String(parts.days)) : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
    }
    items.push(
      fill(t("tmInService"), String(list.filter((p) => !p.comingSoon).length)),
    );
    items.push(`${lines.length} ${t("tmLines")}`);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, now]);

  // Trains: one per branch that has stations in service.
  const trains = useMemo<Train[]>(
    () =>
      layout.lines.flatMap((line) =>
        line.branches
          .filter((b) => b.serviceLength > 0)
          .map((b) => {
            const live = b.stations.filter((s) => !s.soon);
            return {
              branch: b,
              stops: [0, ...live.map((s) => s.at)],
              stationIds: [null, ...live.map((s) => s.productId)],
            };
          }),
      ),
    [layout, mobile],
  );
  const trainRefs = useRef<Array<SVGGElement | null>>([]);
  const markerRefs = useRef<Record<string, SVGCircleElement | null>>({});

  useEffect(() => {
    const place = (i: number, dist: number) => {
      const tr = trains[i];
      const el = trainRefs.current[i];
      if (!tr || !el) return;
      const p = pointAt(tr.branch.points, dist);
      el.setAttribute(
        "transform",
        `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`,
      );
    };
    if (!motion.running) {
      trains.forEach((tr, i) => place(i, tr.stops[1] ?? 0));
      return;
    }
    const speed = (mobile ? 60 : 110) * motion.scale;
    const dwell = 900;
    const state = trains.map((_, i) => ({
      k: 0,
      dirn: 1,
      t0: performance.now() + i * 450,
      dwelling: true,
    }));
    let raf = 0;
    const tick = (now: number) => {
      trains.forEach((tr, i) => {
        const s = state[i];
        if (!s || tr.stops.length < 2) return;
        const from = tr.stops[s.k] ?? 0;
        if (s.dwelling) {
          place(i, from);
          if (now - s.t0 >= dwell) {
            s.dwelling = false;
            s.t0 = now;
          }
          return;
        }
        if (s.k + s.dirn < 0 || s.k + s.dirn >= tr.stops.length) s.dirn *= -1;
        const toK = s.k + s.dirn;
        const to = tr.stops[toK] ?? from;
        const dur = Math.max(500, (Math.abs(to - from) / speed) * 1000);
        const u = Math.min(1, (now - s.t0) / dur);
        const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
        place(i, from + (to - from) * e);
        if (u >= 1) {
          s.k = toK;
          s.dwelling = true;
          s.t0 = now;
          const id = tr.stationIds[toK];
          const m = id ? markerRefs.current[id] : null;
          if (m) {
            m.removeAttribute("data-pulse");
            void m.getBoundingClientRect();
            m.setAttribute("data-pulse", "");
          }
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trains, motion.running, motion.scale, mobile]);

  const openProduct = inspector.openId
    ? (byId.get(inspector.openId) ?? null)
    : null;
  const openLine = openProduct ? lineOf(openProduct.category) : undefined;
  const tipStation = hover?.productId
    ? layout.lines
        .flatMap((l) => l.branches.flatMap((b) => b.stations))
        .find((s) => s.productId === hover.productId)
    : undefined;
  const openStation = openProduct
    ? layout.lines
        .flatMap((l) => l.branches.flatMap((b) => b.stations))
        .find((st) => st.productId === openProduct.id)
    : undefined;
  // Dock the board on the physical side away from the selected station so it stays visible.
  const dock =
    openStation && (openStation.x - view.x) / view.w > 0.5
      ? "tm-dock-left"
      : "tm-dock-right";
  const px = (x: number) => `${((x - view.x) / view.w) * 100}%`;
  const py = (y: number) => `${((y - view.y) / view.h) * 100}%`;

  return (
    <div
      ref={root}
      className="tm-stage"
      data-mobile={mobile ? "" : undefined}
      data-hot={hot ?? undefined}
    >
      <div className="tm-ticker" aria-label={ticker.join(" · ")} role="status">
        <span className="tm-ticker-tag" aria-hidden="true">
          {t("tmDepartures")}
        </span>
        <div className="tm-ticker-window" aria-hidden="true">
          <div
            className="tm-ticker-track"
            data-static={motion.animate ? undefined : ""}
          >
            {[0, 1].map((copy) => (
              <span key={copy} className="tm-ticker-run">
                {ticker.map((item) => (
                  <span key={item} className="tm-ticker-item">
                    <bdi>{item}</bdi>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="tm-head">
        <div>
          <p className="tm-eyebrow">{t("tmNetwork")}</p>
          <p className="tm-title" aria-hidden="true">
            {settings.displayTitle}
          </p>
          {settings.tagline ? (
            <p className="tm-tagline">{settings.tagline}</p>
          ) : null}
        </div>
        <div className="tm-legend" role="group" aria-label={t("tmLines")}>
          {lines.map((l) => {
            const label =
              byId.get(list.find((p) => p.category === l.category)?.id ?? "")
                ?.label ?? l.category;
            return (
              <button
                key={l.category}
                type="button"
                className="tm-legend-item"
                aria-pressed={pinned === l.category}
                aria-label={fill(t("tmHighlight"), label)}
                data-dim={hot && hot !== l.category ? "" : undefined}
                onClick={() =>
                  setPinned((v) => (v === l.category ? null : l.category))
                }
              >
                <span
                  className="tm-roundel"
                  style={
                    {
                      "--line": l.color,
                      "--line-ink": metroInk(l.color),
                    } as CSSProperties
                  }
                >
                  {l.badge}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="tm-map"
        dir="ltr"
        style={{ aspectRatio: `${view.w} / ${view.h}` }}
        role="group"
        aria-label={t("stageProductsLabel")}
      >
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="tm-svg"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="tm-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="8" height="8" fill="var(--tm-paper)" />
              <rect width="3" height="8" fill="var(--tm-orange)" />
            </pattern>
          </defs>
          {layout.lines.map((line) => {
            const info = lineOf(line.category);
            if (!info) return null;
            const state = hot
              ? hot === line.category
                ? "hot"
                : "dim"
              : undefined;
            return (
              <g
                key={line.category}
                className="tm-line"
                data-state={state}
                style={{ "--line": info.color } as CSSProperties}
              >
                {line.branches.map((b, bi) => {
                  const [live, build] = splitAt(b.points, b.serviceLength);
                  return (
                    <g key={bi}>
                      {build.length > 1 ? (
                        <>
                          <path d={d(build)} className="tm-build-bed" />
                          <path d={d(build)} className="tm-build" />
                        </>
                      ) : null}
                      {live.length > 1 ? (
                        <path d={d(live)} className="tm-track" />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {layout.headers?.map((h) => {
            const info = lineOf(h.category);
            if (!info) return null;
            const label =
              list.find((p) => p.category === h.category)?.label ?? h.category;
            return (
              <g
                key={h.category}
                className="tm-line"
                data-state={
                  hot ? (hot === h.category ? "hot" : "dim") : undefined
                }
              >
                <circle cx={h.x} cy={h.y} r={13} fill={info.color} />
                <text x={h.x} y={h.y + 4.5} className="tm-badge-text">
                  {info.badge}
                </text>
                <text x={h.x + 24} y={h.y + 5} className="tm-line-name">
                  {label}
                </text>
              </g>
            );
          })}
          {trains.map((tr, i) => {
            const line = layout.lines.find((l) =>
              l.branches.includes(tr.branch),
            );
            const info = line ? lineOf(line.category) : undefined;
            return (
              <g
                key={i}
                ref={(el) => {
                  trainRefs.current[i] = el;
                }}
                className="tm-train"
                data-state={
                  hot && line
                    ? hot === line.category
                      ? "hot"
                      : "dim"
                    : undefined
                }
              >
                <rect
                  x={-18}
                  y={-7.5}
                  width={36}
                  height={15}
                  rx={7.5}
                  fill={info?.color}
                  stroke="var(--tm-ink)"
                  strokeWidth={1.5}
                />
                <rect
                  x={-11}
                  y={-3}
                  width={22}
                  height={4.5}
                  rx={2}
                  fill="var(--tm-paper)"
                />
              </g>
            );
          })}
          {layout.lines.map((line) => {
            const info = lineOf(line.category);
            const state = hot
              ? hot === line.category
                ? "hot"
                : "dim"
              : undefined;
            return line.branches.flatMap((b) =>
              b.stations.map((s) => {
                const p = byId.get(s.productId);
                const tagY =
                  s.anchor === "middle"
                    ? s.ly < s.y
                      ? s.ly - 18
                      : s.ly + 18
                    : s.ly + 17;
                return (
                  <g
                    key={s.productId}
                    className="tm-station"
                    data-state={state}
                    data-soon={s.soon ? "" : undefined}
                  >
                    <circle
                      ref={(el) => {
                        markerRefs.current[s.productId] = el;
                      }}
                      cx={s.x}
                      cy={s.y}
                      r={8}
                      className="tm-marker"
                      style={{ "--line": info?.color } as CSSProperties}
                    />
                    <text
                      x={s.lx}
                      y={s.ly}
                      textAnchor={s.anchor}
                      className="tm-label"
                    >
                      {s.label}
                    </text>
                    {s.soon ? (
                      <text
                        x={s.lx}
                        y={tagY}
                        textAnchor={s.anchor}
                        className="tm-tag"
                      >
                        {p?.publicationDate
                          ? fill(
                              t("tmOpening"),
                              shortDate(p.publicationDate, language),
                            )
                          : t("tmOpeningSoon")}
                      </text>
                    ) : null}
                  </g>
                );
              }),
            );
          })}
          <g className="tm-central">
            <rect
              x={layout.central.x}
              y={layout.central.y}
              width={layout.central.w}
              height={layout.central.h}
              rx={layout.central.h / 2}
            />
            {settings.logoUrl ? (
              <image
                href={settings.logoUrl}
                x={layout.central.x + 16}
                y={layout.central.y + 10}
                width={layout.central.h - 20}
                height={layout.central.h - 20}
              />
            ) : null}
            <text
              x={
                layout.central.x +
                (settings.logoUrl ? layout.central.h - 4 : 0) +
                (layout.central.w -
                  (settings.logoUrl ? layout.central.h - 4 : 0)) /
                  2
              }
              y={layout.central.y + layout.central.h / 2 + 6}
              className="tm-central-text"
            >
              {t("tmCentral")}
            </text>
          </g>
        </svg>

        {layout.lines.flatMap((line) =>
          line.branches.flatMap((b) =>
            b.stations.map((s) => {
              const p = byId.get(s.productId);
              if (!p) return null;
              return (
                <button
                  key={s.productId}
                  type="button"
                  className="tm-hit"
                  style={{ left: px(s.x), top: py(s.y) }}
                  aria-label={`${p.name} — ${p.label} — ${p.comingSoon ? t("comingSoonBadge") : t("tmInServiceStatus")}`}
                  aria-expanded={inspector.openId === p.id}
                  data-selected={inspector.openId === p.id ? "" : undefined}
                  onPointerEnter={() =>
                    setHover({ category: line.category, productId: p.id })
                  }
                  onPointerLeave={() => setHover(null)}
                  onFocus={() =>
                    setHover({ category: line.category, productId: p.id })
                  }
                  onBlur={() => setHover(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) =>
                    inspector.openId === p.id
                      ? inspector.close()
                      : inspector.open(p.id, e.currentTarget)
                  }
                />
              );
            }),
          ),
        )}

        {tipStation && hover?.productId && !mobile ? (
          <div
            className="tm-tip"
            dir={dir}
            style={{ left: px(tipStation.x), top: py(tipStation.y) }}
            aria-hidden="true"
          >
            <span
              className="tm-roundel"
              style={
                {
                  "--line": lineOf(hover.category)?.color,
                  "--line-ink": metroInk(lineOf(hover.category)?.color),
                } as CSSProperties
              }
            >
              {lineOf(hover.category)?.badge}
            </span>
            <bdi>{tipStation.full}</bdi>
          </div>
        ) : null}
      </div>

      {openProduct && openLine ? (
        <InspectorPanel
          product={openProduct}
          className={`tm-board ${dock}`}
          onClose={inspector.close}
          title={t("tmDepartures")}
        >
          <BoardBody
            key={`${openProduct.id}-${language}`}
            product={openProduct}
            badge={openLine.badge}
            color={openLine.color}
            animate={motion.animate}
          />
        </InspectorPanel>
      ) : null}
    </div>
  );
}
