import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/language";
import { fill, fill2 } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  prepareCanvas,
  useElementSize,
  useFrameLoop,
  useMobile,
  useStageInspector,
} from "../stage-kit";
import { legacyFileName } from "../legacy-to-digital/model";
import {
  AUTO_START_MS,
  FIX_TOTAL_MS,
  FLY_MS,
  SESSION_KEY,
  along,
  backgroundMix,
  corePoint,
  elastic,
  fileSlots,
  fixPhase,
  mixHex,
  nextUnfixed,
  orthoRoute,
  shouldAutoStart,
  tanglePath,
  type Pt,
} from "./model";

const BEIGE = "#ECE5D3";
const INK = "#4A4536";
const BLUE = "#2F6BFF";
const CYAN = "#00D4FF";
const VIOLET = "#8B5CF6";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawDrone(ctx: CanvasRenderingContext2D, p: Pt, t: number) {
  const bob = Math.sin(t * 0.006) * 3;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(0, -26);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(0, -28, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 2.5;
  roundRect(ctx, -20, -16, 40, 30, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0F1730";
  roundRect(ctx, -14, -9, 28, 14, 7);
  ctx.fill();
  ctx.fillStyle = CYAN;
  const blink = Math.sin(t * 0.004) > 0.97 ? 1 : 4;
  ctx.fillRect(-8, -3 - blink / 2, 4, blink);
  ctx.fillRect(4, -3 - blink / 2, 4, blink);
  ctx.restore();
}

export default function UntangleChaosStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const size = useElementSize(root);
  const list = useMemo(() => products.slice(0, 12), [products]);
  const n = list.length;
  const inspector = useStageInspector(list, "uc-inspector");
  const [fixedCount, setFixedCount] = useState(0);
  const fixedAt = useRef(new Map<number, number>());
  const clock = useRef(0);
  const drone = useRef<{ from: Pt; to: Pt; at: number }>({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    at: 0,
  });
  const log = useRef<string[]>([]);
  const allDoneAt = useRef<number | null>(null);
  const interacted = useRef(false);
  const timers = useRef<number[]>([]);
  const [liveLine, setLiveLine] = useState("");

  const slots = useMemo(() => {
    const raw = fileSlots(n, size.w, size.h, mobile);
    return rtl ? raw.map((p) => ({ x: size.w - p.x, y: p.y })) : raw;
  }, [n, size.w, size.h, mobile, rtl]);
  const core = corePoint(size.w, size.h, mobile);
  const finished = !motion.animate || (n > 0 && fixedCount >= n);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const fix = useCallback(
    (i: number) => {
      if (fixedAt.current.has(i) || !slots[i]) return;
      const at = clock.current;
      fixedAt.current.set(i, at);
      const d = drone.current;
      const cur = along([d.from, d.to], Math.min(1, (at - d.at) / FLY_MS));
      drone.current = { from: cur, to: { x: slots[i].x, y: slots[i].y - 52 }, at };
      const id = window.setTimeout(() => {
        const name = list[i]?.name ?? "";
        log.current = [...log.current, `> ${name} ... OK`].slice(-5);
        setLiveLine(`${name} OK`);
        setFixedCount((c) => {
          const next = c + 1;
          if (next >= n) allDoneAt.current = clock.current;
          return next;
        });
      }, FIX_TOTAL_MS);
      timers.current.push(id);
    },
    [slots, list, n],
  );

  const fixAll = useCallback(() => {
    const run = () => {
      const i = nextUnfixed(new Set(fixedAt.current.keys()), n);
      if (i === null) return;
      fix(i);
      timers.current.push(window.setTimeout(run, FIX_TOTAL_MS * 0.75));
    };
    run();
  }, [fix, n]);

  // First visit in the session: Archy tidies everything after two seconds unless the visitor acts.
  useEffect(() => {
    if (!motion.animate || n === 0) return;
    let ran = false;
    try {
      ran = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      ran = true;
    }
    const id = window.setTimeout(() => {
      if (!shouldAutoStart(ran, interacted.current, true)) return;
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode */
      }
      fixAll();
    }, AUTO_START_MS);
    return () => window.clearTimeout(id);
  }, [motion.animate, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardW = mobile ? 132 : 164;
  const cardH = mobile ? 48 : 56;

  useFrameLoop(
    motion.running,
    (ms) => {
      clock.current = ms;
      const c = canvas.current;
      if (!c) return;
      const ctx = prepareCanvas(c, size.w, size.h);
      if (!ctx) return;
      const still = !motion.animate;
      const time = still ? 0 : ms;
      ctx.direction = rtl ? "rtl" : "ltr";
      const mix = still ? 1 : backgroundMix(fixedCount, n);
      const g = ctx.createLinearGradient(0, 0, 0, size.h);
      g.addColorStop(0, mixHex(BEIGE, "#FFFFFF", mix));
      g.addColorStop(1, mixHex("#E2D9C2", "#F2F6FF", mix));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size.w, size.h);

      const done = still || allDoneAt.current !== null;
      // Cables and routes.
      list.forEach((_, i) => {
        const from = slots[i];
        if (!from) return;
        const st = still
          ? { phase: "done" as const, k: 1 }
          : fixPhase(fixedAt.current.has(i) ? time - fixedAt.current.get(i)! : null);
        if (st.phase === "done" || st.phase === "morph") {
          const route = orthoRoute(from, core);
          const reveal = st.phase === "morph" ? st.k : 1;
          ctx.strokeStyle = BLUE;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const p = along(route, (k / 40) * reveal);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          if (reveal >= 1) {
            const dots = Math.max(1, Math.round(3 * motion.scale));
            for (let j = 0; j < dots; j++) {
              const p = along(
                route,
                still ? (j + 0.5) / dots : (time * 0.00035 + j / dots + i * 0.13) % 1,
              );
              ctx.fillStyle = j % 2 ? VIOLET : CYAN;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        if (st.phase !== "done") {
          const pts = tanglePath(from, core, i + 1, time);
          ctx.strokeStyle = `rgba(74,69,54,${st.phase === "morph" ? 1 - st.k : 0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          const end = pts[pts.length - 1]!;
          ctx.fillStyle = INK;
          ctx.fillRect(end.x - 6, end.y - 4, 12, 8);
          ctx.fillRect(end.x - 3, end.y - 8, 2, 4);
          ctx.fillRect(end.x + 1, end.y - 8, 2, 4);
        }
      });

      // Core: CRT while legacy, E20E core once everything runs.
      const coreW = mobile ? 200 : 240;
      const coreH = mobile ? 120 : 150;
      if (!done) {
        ctx.fillStyle = "#D8CFB8";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        roundRect(ctx, core.x - coreW / 2, core.y - coreH / 2, coreW, coreH, 14);
        ctx.fill();
        ctx.stroke();
        const flicker = 0.75 + 0.25 * Math.sin(time * 0.03) * Math.sin(time * 0.011);
        ctx.fillStyle = `rgba(16,24,20,${flicker})`;
        roundRect(ctx, core.x - coreW / 2 + 12, core.y - coreH / 2 + 12, coreW - 24, coreH - 30, 8);
        ctx.fill();
        ctx.fillStyle = "#39FF6A";
        ctx.font = `${mobile ? 15 : 18}px "VT323", "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        ctx.fillText(t("ucCrt"), core.x, core.y - coreH / 2 + 32);
        ctx.font = `${mobile ? 13 : 15}px "VT323", "IBM Plex Mono", monospace`;
        log.current.slice(-3).forEach((line, k) => ctx.fillText(line, core.x, core.y - 4 + k * 16));
      } else {
        const since = still ? 9999 : time - (allDoneAt.current ?? 0);
        for (let w = 0; w < 3; w++) {
          const k = (since - w * 280) / 1400;
          if (k > 0 && k < 1) {
            ctx.strokeStyle = `rgba(0,212,255,${1 - k})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(core.x, core.y, 40 + k * Math.max(size.w, size.h) * 0.6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        const r = mobile ? 50 : 62;
        const cg = ctx.createLinearGradient(core.x - r, core.y - r, core.x + r, core.y + r);
        cg.addColorStop(0, BLUE);
        cg.addColorStop(0.5, CYAN);
        cg.addColorStop(1, VIOLET);
        ctx.fillStyle = cg;
        roundRect(ctx, core.x - r, core.y - r, r * 2, r * 2, 18);
        ctx.fill();
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -time * 0.05;
        ctx.beginPath();
        ctx.arc(core.x, core.y, r + 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.font = `700 ${mobile ? 18 : 22}px "Sora", sans-serif`;
        ctx.fillText("E20E", core.x, core.y + 4);
        ctx.fillStyle = "#0F1730";
        ctx.font = `600 13px "Sora", "IBM Plex Sans Arabic", sans-serif`;
        ctx.fillText(t("ucRunning"), core.x, core.y + r + 38);
      }

      // Files and chips.
      list.forEach((product, i) => {
        const s = slots[i];
        if (!s) return;
        const st = still
          ? { phase: "done" as const, k: 1 }
          : fixPhase(fixedAt.current.has(i) ? time - fixedAt.current.get(i)! : null);
        const fileScale =
          st.phase === "morph" ? Math.max(0, 1 - st.k * 2) : st.phase === "done" ? 0 : 1;
        if (fileScale > 0) {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.scale(fileScale, fileScale);
          ctx.rotate(((i % 3) - 1) * 0.04);
          ctx.fillStyle = "#F6F1E3";
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 6);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = INK;
          ctx.textAlign = "center";
          ctx.font = `${mobile ? 14 : 16}px "VT323", "IBM Plex Mono", monospace`;
          ctx.direction = "ltr";
          const label = legacyFileName(product);
          ctx.fillText(label.length > 22 ? `${label.slice(0, 21)}…` : label, 0, 5, cardW - 12);
          ctx.restore();
          ctx.direction = rtl ? "rtl" : "ltr";
        }
        if (st.phase === "scan") {
          const top = { x: s.x, y: s.y - 52 };
          ctx.fillStyle = `rgba(0,212,255,${0.25 + 0.2 * Math.sin(st.k * Math.PI * 6)})`;
          ctx.beginPath();
          ctx.moveTo(top.x - 6, top.y + 12);
          ctx.lineTo(top.x + 6, top.y + 12);
          ctx.lineTo(s.x + cardW / 2, s.y + cardH / 2);
          ctx.lineTo(s.x - cardW / 2, s.y + cardH / 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = CYAN;
          ctx.fillRect(s.x - cardW / 2, s.y - cardH / 2 + cardH * st.k, cardW, 2);
        }
        const chipScale = st.phase === "done" ? 1 : st.phase === "morph" ? elastic(st.k) : 0;
        if (chipScale > 0) {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.scale(chipScale, chipScale);
          const cg = ctx.createLinearGradient(-cardW / 2, 0, cardW / 2, 0);
          cg.addColorStop(0, BLUE);
          cg.addColorStop(1, product.comingSoon ? VIOLET : "#1B9FD6");
          ctx.fillStyle = cg;
          roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 12);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.direction = "ltr";
          ctx.font = `700 ${mobile ? 14 : 16}px "Sora", sans-serif`;
          ctx.fillText(product.name, 0, product.comingSoon ? -1 : 6, cardW - 16);
          if (product.comingSoon) {
            ctx.direction = rtl ? "rtl" : "ltr";
            ctx.font = `500 11px "Sora", "IBM Plex Sans Arabic", sans-serif`;
            ctx.fillText(t("comingSoonBadge"), 0, 16, cardW - 16);
          }
          ctx.restore();
          ctx.direction = rtl ? "rtl" : "ltr";
        }
      });

      // Archy's drone.
      const d = drone.current;
      const rest = done
        ? { x: core.x + (mobile ? 90 : 120), y: core.y - (mobile ? 60 : 80) }
        : null;
      const pos = still
        ? { x: core.x + (mobile ? 90 : 120), y: core.y - (mobile ? 60 : 80) }
        : fixedAt.current.size === 0
          ? { x: core.x, y: core.y - (mobile ? 100 : 120) }
          : along([d.from, d.to], Math.min(1, (time - d.at) / FLY_MS));
      drawDrone(ctx, rest && !fixedAt.current.size ? rest : pos, time);
    },
    [size.w, size.h, motion.animate, fixedCount, language, mobile, n, slots],
  );

  const onInteract = () => {
    interacted.current = true;
  };

  return (
    <div
      ref={root}
      className="uc-stage"
      dir={dir}
      onPointerDown={onInteract}
      onKeyDown={onInteract}
      data-done={finished ? "" : undefined}
    >
      <canvas ref={canvas} className="uc-canvas" aria-hidden="true" />
      <h2 className="uc-title">{settings.displayTitle}</h2>
      {list.map((product, i) => {
        const s = slots[i];
        if (!s) return null;
        const isFixed = finished || fixedAt.current.has(i);
        return (
          <button
            key={product.id}
            type="button"
            className="uc-hit"
            style={{ left: s.x - cardW / 2, top: s.y - cardH / 2, width: cardW, height: cardH }}
            aria-label={
              isFixed
                ? fill(t("ucToolLabel"), product.name)
                : fill2(t("ucFileLabel"), legacyFileName(product), product.name)
            }
            onClick={(e) => (isFixed ? inspector.open(product.id, e.currentTarget) : fix(i))}
          />
        );
      })}
      <div className="uc-bar">
        <span className="uc-counter" aria-live="polite">
          {fill2(t("ucCounter"), String(finished ? n : fixedCount), String(n))}
        </span>
        {finished ? (
          <>
            <Link to="/discover" className="uc-btn uc-btn-primary">
              {t("ucDiscover")}
            </Link>
            <Link to="/request" className="uc-btn">
              {t("ucRequest")}
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="uc-btn uc-btn-primary"
            onClick={() => {
              interacted.current = true;
              fixAll();
            }}
          >
            {t("ucFixAll")}
          </button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {liveLine}
      </span>
      {inspector.panel}
    </div>
  );
}
