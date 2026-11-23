import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  LEGACY_DESKTOP_FILES,
  legacyFileName,
} from "../legacy-to-digital/model";

/** Digital share (0–100) at which product i crosses the beam. */
export function crossAt(i: number, count: number): number {
  if (count <= 1) return 30;
  return Math.round(20 + (i * 60) / (count - 1));
}

/** Node position inside the digital half: inline offset (0–1 from the far edge) and top %. */
const SLOTS: ReadonlyArray<{ u: number; top: number }> = [
  { u: 0, top: 8 },
  { u: 1, top: 8 },
  { u: 0, top: 42 },
  { u: 1, top: 42 },
  { u: 0, top: 76 },
  { u: 1, top: 76 },
];

const clamp = (v: number) => Math.max(10, Math.min(90, Math.round(v)));

export default function TimeScannerStage({ products, settings }: StageProps) {
  const { language, dir } = useLanguage();
  const ar = language === "ar";
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const [pct, setPct] = useState(60);
  const list = useMemo(() => products.slice(0, SLOTS.length), [products]);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const fromStart = rtl ? box.right - e.clientX : e.clientX - box.left;
    setPct(clamp(100 - (fromStart / box.width) * 100));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 5;
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward || e.key === "ArrowUp")
      setPct((p) => clamp(p + step));
    else if (e.key === back || e.key === "ArrowDown")
      setPct((p) => clamp(p - step));
    else if (e.key === "Home") setPct(10);
    else if (e.key === "End") setPct(90);
    else return;
    e.preventDefault();
  };

  const legacy = 100 - pct;
  const pending = list.filter((_, i) => pct < crossAt(i, list.length));
  const junk = LEGACY_DESKTOP_FILES.slice(0, Math.max(0, 4 - pending.length));

  return (
    <div
      className="tscan-stage"
      data-motion={motion.animate ? "on" : "off"}
      data-paused={motion.running ? undefined : ""}
    >
      <div
        ref={root}
        className="tscan-visual"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <div className="tscan-grid" aria-hidden="true" />

        <div className="tscan-digital">
          <div className="tscan-hub">
            <strong dir="ltr">{settings.displayTitle || "E20E"}</strong>
            <small>{ar ? "منظومة واحدة" : "One system"}</small>
          </div>
          {list.map((p, i) => {
            const slot = SLOTS[i]!;
            const live = pct >= crossAt(i, list.length);
            return (
              <Link
                key={p.id}
                to="/product/$productId"
                params={{ productId: p.id }}
                className="tscan-node"
                data-live={live ? "" : undefined}
                data-soon={p.comingSoon ? "" : undefined}
                style={{
                  insetInlineEnd: `${3 + slot.u * 52}%`,
                  top: `${slot.top}%`,
                }}
              >
                <span className="tscan-node-head">
                  <b dir="ltr">{p.name}</b>
                  <em>
                    {p.comingSoon
                      ? ar
                        ? "قريبًا"
                        : "Soon"
                      : ar
                        ? "متاحة"
                        : "Live"}
                  </em>
                </span>
                <span className="tscan-node-label">
                  {live ? p.label : ar ? "قيد الترحيل…" : "Migrating…"}
                </span>
              </Link>
            );
          })}
        </div>

        <div
          className="tscan-legacy"
          style={{ inlineSize: `${legacy}%` }}
          aria-hidden="true"
        >
          <span className="tscan-legacy-tag" dir="ltr">
            LEGACY_ENTERPRISE.EXE — {ar ? "(لا يستجيب)" : "(Not Responding)"}
          </span>
          <div className="tscan-files">
            {pending.map((p, i) => (
              <span
                key={p.id}
                className="tscan-file"
                style={{ ["--r" as string]: `${(i % 2 ? 3 : -4) + i}deg` }}
                dir="ltr"
              >
                <i data-kind={i % 4} />
                {legacyFileName(p)}
              </span>
            ))}
            {junk.map((name, i) => (
              <span
                key={name}
                className="tscan-file tscan-file-junk"
                style={{ ["--r" as string]: `${i % 2 ? -3 : 4}deg` }}
                dir="ltr"
              >
                <i data-kind={(i + 2) % 4} />
                {name}
              </span>
            ))}
          </div>
        </div>

        <div className="tscan-beam" style={{ insetInlineStart: `${legacy}%` }}>
          <button
            type="button"
            role="slider"
            className="tscan-handle"
            aria-label={
              ar
                ? "نسبة التحول من القديم إلى الرقمي"
                : "Legacy to digital transformation"
            }
            aria-valuemin={10}
            aria-valuemax={90}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
            onKeyDown={onKey}
          >
            <svg
              aria-hidden="true"
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
            </svg>
          </button>
          <span className="tscan-readout" dir="ltr">
            TRANSFORM {pct}%
          </span>
        </div>
      </div>

      <div className="tscan-copy">
        <p className="tscan-kicker" dir="ltr">
          &gt; MIGRATING ENTERPRISE ARCHITECTURE
          <span className="tscan-caret">_</span>
        </p>
        <h1>{settings.displayTitle}</h1>
        <p className="tscan-lead">
          {settings.tagline ||
            (ar
              ? "من ملفات مبعثرة إلى منظومة واحدة حيّة."
              : "From scattered files to one living system.")}
        </p>
        <div className="tscan-actions">
          <a href="#catalog" className="tscan-cta">
            {ar
              ? `استكشف الأدوات (${products.length})`
              : `Explore the tools (${products.length})`}
          </a>
          <a href="/discover" className="tscan-ghost">
            {ar ? "ابدأ باحتياجك" : "Start with your need"}
          </a>
        </div>
      </div>

      <div className="tscan-timeline" dir="ltr" aria-hidden="true">
        <span>2017 · VISIO</span>
        <span>2019 · EXCEL</span>
        <span>2021 · SHAREPOINT</span>
        <i />
        <b>2026 · E20E</b>
      </div>
    </div>
  );
}
