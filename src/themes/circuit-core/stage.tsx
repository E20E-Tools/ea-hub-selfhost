import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import { formatLaunchDate } from "../launch";
import { chipCode, circuitLayout } from "./layout";

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

type Line = { text: string; productId?: string; kind: "cmd" | "ok" | "soon" | "sum" };

function ChipInspectorBody({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  const rows: Array<[string, string]> = [
    ["NAME", product.name],
    ["CLASS", product.label],
    ["STATUS", facts.available ? "ONLINE" : "STANDBY"],
  ];
  if (facts.launch)
    rows.push(["LAUNCH", facts.countdown ? `${facts.launch} · ${facts.countdown}` : facts.launch]);
  if (product.version) rows.push(["VERSION", product.version]);
  return (
    <div className="cc-inspect-body">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <bdi>{v}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p className="cc-inspect-desc">{product.description}</p>
      {product.whatsNew ? (
        <p className="cc-inspect-desc">
          <span className="cc-key">{t("inspectorWhatsNew")}:</span> {product.whatsNew}
        </p>
      ) : null}
      {facts.features.length ? (
        <div className="cc-inspect-features">
          <span className="cc-key">FEATURES</span>
          <ul>
            {facts.features.map((f) => (
              <li key={f}>
                <span dir="ltr">[x]</span> {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <InspectorActions
        product={product}
        className="cc-inspect-actions"
        details={`[ ${t("details").toUpperCase()} ]`}
        openTool={`[ ${t("inspectorOpenTool").toUpperCase()} ↗ ]`}
      />
    </div>
  );
}

export default function CircuitCoreStage({ products, settings }: StageProps) {
  const { t, language, dir } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const list = products.slice(0, 12);
  const layout = useMemo(() => circuitLayout(list.length, mobile), [list.length, mobile]);
  const inspector = useProductInspector();
  const [hot, setHot] = useState<string | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelWrap = useRef<HTMLDivElement>(null);
  const [probe, setProbe] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  const listKey = list
    .map((p) => [p.id, p.name, p.label, p.comingSoon, p.publicationDate].join("~"))
    .join("|");
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [{ text: "$ e20e boot --enterprise", kind: "cmd" }];
    for (const p of list) {
      out.push(
        p.comingSoon
          ? {
              kind: "soon",
              productId: p.id,
              text: `◌ ${p.name} ${t("ccStandby")} · ${
                p.publicationDate
                  ? fill(
                      t("inspectorLaunches"),
                      formatLaunchDate(p.publicationDate, language),
                    ).toLowerCase()
                  : t("comingSoonBadge")
              }`,
            }
          : { kind: "ok", productId: p.id, text: `✓ ${p.name} ${t("ccOnline")} · ${p.label}` },
      );
    }
    out.push({
      kind: "sum",
      text: `■ ${list.filter((p) => !p.comingSoon).length} ${t("ccToolsOnline")}`,
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, language]);

  // Typing engine: one line at a time; each product line powers its chip as it starts.
  const [pos, setPos] = useState({ line: 0, char: 0 });
  useEffect(() => setPos({ line: 0, char: 0 }), [lines]);
  useEffect(() => {
    if (!motion.running) return;
    const current = lines[pos.line];
    let delay: number;
    let next: { line: number; char: number };
    if (!current) {
      delay = 4200;
      next = { line: 0, char: 0 };
    } else if (pos.char < current.text.length) {
      delay = 24 / motion.scale;
      next = { line: pos.line, char: pos.char + 1 };
    } else {
      delay = 360 / motion.scale;
      next = { line: pos.line + 1, char: 0 };
    }
    const id = window.setTimeout(() => setPos(next), delay);
    return () => window.clearTimeout(id);
  }, [pos, lines, motion.running, motion.scale]);
  const shown = motion.animate ? pos : { line: lines.length, char: 0 };
  const powered = (index: number) => shown.line >= index + 1;

  const openProduct = list.find((p) => p.id === inspector.openId) ?? null;

  useLayoutEffect(() => {
    if (!openProduct || mobile) return setProbe(null);
    const frame = requestAnimationFrame(() => {
      const base = root.current?.getBoundingClientRect();
      const chip = chipRefs.current[openProduct.id]?.getBoundingClientRect();
      const panel = panelWrap.current?.getBoundingClientRect();
      if (!base || !chip || !panel) return;
      const toStart = dir === "rtl" ? panel.left - base.left : panel.right - base.left;
      setProbe({
        x1: chip.left + chip.width / 2 - base.left,
        y1: chip.top + chip.height / 2 - base.top,
        x2: toStart,
        y2: panel.top + 28 - base.top,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [openProduct, mobile, dir]);

  const pulses = motion.intensity === "high" ? 2 : 1;

  return (
    <div
      ref={root}
      className="cc-stage"
      data-mobile={mobile ? "" : undefined}
      data-focus={hot ?? undefined}
      style={{ ["--cc-speed" as string]: String(motion.scale) }}
    >
      <div className="cc-intro">
        <p className="cc-eyebrow">
          <span dir="ltr">&gt;</span> {t("ccEyebrow")}
          <span className="cc-caret" aria-hidden="true">
            ▌
          </span>
        </p>
        <p className="cc-title" aria-hidden="true">
          {settings.displayTitle}
        </p>
        {settings.tagline ? <p className="cc-tagline">{settings.tagline}</p> : null}
      </div>

      <div className="cc-board-wrap">
        <div
          className="cc-board"
          dir="ltr"
          style={{ aspectRatio: `${layout.w} / ${layout.h}` }}
          role="group"
          aria-label={t("stageProductsLabel")}
        >
          <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className="cc-svg" aria-hidden="true">
            {layout.bus ? <path d={layout.bus} className="cc-bus" /> : null}
            {list.map((p, i) => {
              const trace = layout.traces[i];
              if (!trace) return null;
              const state = hot ? (hot === p.id ? "hot" : "dim") : powered(i) ? "on" : "off";
              return (
                <g
                  key={p.id}
                  className="cc-trace"
                  data-state={state}
                  data-soon={p.comingSoon ? "" : undefined}
                >
                  <path d={trace.d} className="cc-trace-line" />
                  {trace.vias.map(([x, y], k) => (
                    <circle key={k} cx={x} cy={y} r={4} className="cc-via" />
                  ))}
                  {powered(i)
                    ? Array.from({ length: pulses }, (_, k) => (
                        <path
                          key={k}
                          d={trace.d}
                          pathLength={100}
                          className="cc-pulse"
                          style={{ animationDelay: `${(k * 1.2 + i * 0.37) / motion.scale}s` }}
                        />
                      ))
                    : null}
                </g>
              );
            })}
          </svg>

          <div
            className="cc-core"
            style={{
              left: `${(layout.core.x / layout.w) * 100}%`,
              top: `${(layout.core.y / layout.h) * 100}%`,
              width: `${(layout.core.w / layout.w) * 100}%`,
              height: `${(layout.core.h / layout.h) * 100}%`,
            }}
          >
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" className="cc-core-logo" />
            ) : null}
            <strong>{settings.displayTitle.toUpperCase()}</strong>
            {settings.tagline ? <small>{settings.tagline}</small> : null}
          </div>

          {list.map((p, i) => {
            const box = layout.chips[i];
            if (!box) return null;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  chipRefs.current[p.id] = el;
                }}
                type="button"
                className="cc-chip"
                data-powered={powered(i) ? "" : undefined}
                data-soon={p.comingSoon ? "" : undefined}
                data-selected={inspector.openId === p.id ? "" : undefined}
                aria-label={`${p.name} — ${p.label} — ${p.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}`}
                aria-expanded={inspector.openId === p.id}
                style={{
                  left: `${(box.x / layout.w) * 100}%`,
                  top: `${(box.y / layout.h) * 100}%`,
                  width: `${(box.w / layout.w) * 100}%`,
                  height: `${(box.h / layout.h) * 100}%`,
                }}
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
                <span className="cc-led" aria-hidden="true" />
                <span className="cc-dot" aria-hidden="true" />
                <span className="cc-code">{chipCode(p)}</span>
                <span className="cc-sub">{p.label}</span>
                {p.comingSoon ? (
                  <span className="cc-stamp" aria-hidden="true">
                    {t("ccStandbyStamp")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="cc-console" dir={dir} aria-hidden="true">
          <div className="cc-console-bar">
            <i />
            <i />
            <i />
            <span dir="ltr">e20e — boot.sh</span>
          </div>
          <pre>
            {lines.map((line, i) => {
              if (i > shown.line) return null;
              const text = i === shown.line ? line.text.slice(0, shown.char) : line.text;
              return (
                <div key={i} className={`cc-line cc-line-${line.kind}`}>
                  <bdi>{text}</bdi>
                  {i === shown.line && motion.animate ? <span className="cc-caret">▌</span> : null}
                </div>
              );
            })}
          </pre>
        </div>
      </div>

      {probe ? (
        <svg className="cc-probe" aria-hidden="true">
          <path d={`M${probe.x1} ${probe.y1}L${probe.x2} ${probe.y2}`} pathLength={100} />
          <circle cx={probe.x2} cy={probe.y2} r={4} />
        </svg>
      ) : null}

      {openProduct ? (
        <div ref={panelWrap} className="cc-inspect-wrap">
          <InspectorPanel
            product={openProduct}
            className="cc-inspect"
            onClose={inspector.close}
            title={<span dir="ltr">{`chip.inspect("${openProduct.id}")`}</span>}
          >
            <ChipInspectorBody product={openProduct} />
          </InspectorPanel>
        </div>
      ) : null}
    </div>
  );
}
