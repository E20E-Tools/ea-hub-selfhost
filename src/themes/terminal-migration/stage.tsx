import { useEffect, useMemo, useRef, useState } from "react";
import { FeatureOnly } from "@/components/feature-gate";
import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import { legacyFileName } from "../legacy-to-digital/model";

export const MIGRATION_STAGES = [
  {
    en: "Discover",
    ar: "اكتشف",
    log: "scanning legacy files…",
    textAr: "نحصر ملفاتك وتطبيقاتك المتفرقة في قائمة واحدة.",
    textEn: "Scattered files and applications become one inventory.",
  },
  {
    en: "Model",
    ar: "انمذج",
    log: "building capability map…",
    textAr: "نربط كل تطبيق بالقدرة والعملية التي يخدمها.",
    textEn:
      "Every application is linked to the capability and process it serves.",
  },
  {
    en: "Assess",
    ar: "قيّم",
    log: "placing technologies on the radar…",
    textAr: "نضع كل تقنية في حلقة: تبنٍّ، تجربة، تقييم، إيقاف.",
    textEn: "Every technology lands in a ring: adopt, trial, assess, hold.",
  },
  {
    en: "Decide",
    ar: "قرّر",
    log: "writing decision log…",
    textAr: "نوثّق القرار وسببه وتاريخ مراجعته.",
    textEn: "The decision, its reason and its review date are recorded.",
  },
] as const;

export default function TerminalMigrationStage({
  products,
  settings,
}: StageProps) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const [stage, setStage] = useState(0);
  const [touched, setTouched] = useState(false);
  const list = useMemo(() => products.slice(0, 8), [products]);

  useEffect(() => {
    if (!motion.running || touched) return;
    const id = window.setInterval(
      () => setStage((s) => (s + 1) % MIGRATION_STAGES.length),
      3800,
    );
    return () => window.clearInterval(id);
  }, [motion.running, touched]);

  const done = stage + 1;
  const pct = Math.round((done / MIGRATION_STAGES.length) * 100);
  const bar = "#".repeat(Math.round(pct / 5)).padEnd(20, "-");
  const shown = list.slice(
    0,
    Math.max(1, Math.round((done / MIGRATION_STAGES.length) * list.length)),
  );
  const current = MIGRATION_STAGES[stage]!;

  return (
    <div
      ref={root}
      className="tmig-stage"
      data-motion={motion.animate ? "on" : "off"}
      data-paused={motion.running ? undefined : ""}
    >
      <div className="tmig-head">
        <h1>{settings.displayTitle}</h1>
        <p>
          {settings.tagline ||
            (ar
              ? "مؤسستك القديمة، بعد ترحيلها إلى نظام واحد."
              : "Your legacy enterprise, migrated into one system.")}
        </p>
      </div>

      <div className="tmig-machines">
        <div className="tmig-crt" aria-hidden="true">
          <div className="tmig-scan" />
          <pre dir="ltr">
            {"C:\\EA> dir /s\n"}
            {list.map((p) => `  ${legacyFileName(p)}\n`).join("")}
            {"\nC:\\EA> e20e migrate --all\n"}
            {`[${bar}] ${pct}%\n`}
            {`> ${current.log}`}
            <span className="tmig-caret">█</span>
          </pre>
        </div>

        <div
          className="tmig-spine"
          role="group"
          aria-label={ar ? "مراحل الترحيل" : "Migration stages"}
        >
          {MIGRATION_STAGES.map((s, i) => (
            <button
              key={s.en}
              type="button"
              aria-pressed={i === stage}
              data-done={i < stage ? "" : undefined}
              onClick={() => {
                setTouched(true);
                setStage(i);
              }}
            >
              <small dir="ltr">0{i + 1}</small>
              <span>{ar ? s.ar : s.en}</span>
            </button>
          ))}
        </div>

        <div className="tmig-hud">
          <div className="tmig-hud-head">
            <strong>
              {ar
                ? "لوحة المؤسسة بعد الترحيل"
                : "Your enterprise, after migration"}
            </strong>
            <span dir="ltr">LIVE · {current.en.toUpperCase()}</span>
          </div>
          <p className="tmig-step-text" aria-live="polite">
            {ar ? current.textAr : current.textEn}
          </p>
          <div className="tmig-hud-grid">
            <div className="tmig-tools">
              {shown.map((p) => (
                <Link
                  key={p.id}
                  to="/product/$productId"
                  params={{ productId: p.id }}
                  data-soon={p.comingSoon ? "" : undefined}
                >
                  <b dir="ltr">{p.name}</b>
                  <small>{p.label}</small>
                </Link>
              ))}
            </div>
            <div className="tmig-radar" aria-hidden="true">
              <i className="tmig-sweep" />
              <span data-ring="adopt" />
              <span data-ring="trial" />
              <span data-ring="assess" />
              <span data-ring="hold" />
            </div>
          </div>
          <div className="tmig-actions">
            <FeatureOnly feature="discover">
              <a href="/discover">
                {ar ? "ابدأ باحتياجك" : "Start with your need"}
              </a>
            </FeatureOnly>
            <a href="#catalog">{ar ? "كل الأدوات" : "All tools"}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
