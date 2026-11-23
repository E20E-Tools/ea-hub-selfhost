import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import { openAssistantWindow, openToolRequestInChat } from "@/lib/assistant-events";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import { useFrameLoop, useStageInspector } from "../stage-kit";
import { bestMatch, cycleMs, problemFor, typingAt } from "./model";

export function ArchyPointer() {
  return (
    <svg viewBox="0 0 64 56" className="pt-archy" aria-hidden="true">
      <line x1="26" y1="10" x2="26" y2="3" stroke="#4A4536" strokeWidth="2" />
      <circle cx="26" cy="3" r="3" fill="#00D4FF" />
      <rect
        x="6"
        y="10"
        width="40"
        height="30"
        rx="12"
        fill="#fff"
        stroke="#2F6BFF"
        strokeWidth="2.5"
      />
      <rect x="12" y="17" width="28" height="14" rx="7" fill="#0F1730" />
      <rect x="18" y="22" width="4" height="4" fill="#00D4FF" />
      <rect x="30" y="22" width="4" height="4" fill="#00D4FF" />
      <path d="M46 28 L60 22" stroke="#2F6BFF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function ProblemToToolStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const motion = useStageMotion(root);
  const navigate = useNavigate();
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useStageInspector(list, "pt-inspector");
  const problems = useMemo(() => list.map((p) => problemFor(p, language)), [list, language]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "match" | "clear">("match");
  const [query, setQuery] = useState("");
  const cycleStart = useRef(0);
  const userActive = query.trim().length > 0;

  useFrameLoop(
    motion.running && !userActive && list.length > 0,
    (ms) => {
      const text = problems[index] ?? "";
      if (!motion.animate) {
        if (typed.current) typed.current.textContent = text;
        return;
      }
      let local = ms - cycleStart.current;
      if (local > cycleMs(text)) {
        cycleStart.current = ms;
        local = 0;
        setIndex((i) => (i + 1) % Math.max(1, list.length));
        return;
      }
      const st = typingAt(text, local);
      if (typed.current) typed.current.textContent = st.shown;
      setPhase((p) => (p === st.phase ? p : st.phase));
    },
    [index, problems, motion.animate, list.length],
  );

  const matchId = userActive ? bestMatch(query, list, language) : list[index]?.id;
  const showCard = userActive ? Boolean(matchId) : !motion.animate || phase !== "typing";
  const product = list.find((p) => p.id === matchId);

  return (
    <div ref={root} className="pt-stage" dir={dir} data-phase={userActive ? "match" : phase}>
      <h2 className="pt-title">{settings.displayTitle}</h2>
      <form
        className="pt-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const need = (query.trim() || problems[index] || "").slice(0, 500);
          void navigate({ to: "/request", search: { type: "new", need } });
        }}
      >
        <span className="pt-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="pt-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("ptSearchLabel")}
          placeholder={userActive ? "" : undefined}
          maxLength={300}
          dir="auto"
        />
        {!userActive ? (
          <span ref={typed} className="pt-typed" aria-hidden="true">
            {motion.animate ? "" : problems[index]}
          </span>
        ) : null}
        <span className="pt-caret" aria-hidden="true" />
      </form>
      <p className="pt-hint" aria-live="polite">
        {userActive && !matchId ? t("ptNoMatch") : t("ptEnterHint")}
      </p>
      <div className="pt-card-slot">
        {product && showCard ? (
          <div className="pt-card-wrap" key={`${product.id}-${index}`}>
            <ArchyPointer />
            <div className="pt-card-col">
              <button
                type="button"
                className="pt-card"
                aria-label={fill(t("ucToolLabel"), product.name)}
                onClick={(e) => inspector.open(product.id, e.currentTarget)}
              >
                <span className="pt-badge">{t("ptSuggested")}</span>
                <strong className="pt-name" dir="ltr">
                  {product.name}
                </strong>
                <span className="pt-desc">{product.description}</span>
                <span className="pt-status" data-soon={product.comingSoon ? "" : undefined}>
                  {product.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}
                </span>
              </button>
              {product.comingSoon ? null : (
                <button
                  type="button"
                  className="pt-request"
                  onClick={() =>
                    openToolRequestInChat({
                      product: { id: product.id, name: product.name },
                      need: query.trim() || problems[index] || "",
                    })
                  }
                >
                  {t("trRequestTool")}
                </button>
              )}
              <button
                type="button"
                className="pt-request"
                onClick={() =>
                  openAssistantWindow(
                    `${fill(t("trLiveChatDraft"), product.name)} ${query.trim() || problems[index] || ""}`.trim(),
                  )
                }
              >
                {t("trLiveChat")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {inspector.panel}
    </div>
  );
}
