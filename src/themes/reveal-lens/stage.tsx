import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
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
  orthoRoute,
  along,
  tanglePath,
  fileSlots,
} from "../untangle-chaos/model";
import {
  EXPAND_MS,
  IDLE_MS,
  LENS_RADIUS,
  LONG_PRESS_MS,
  chipSlots,
  coverRadius,
  lensRadius,
  lissajous,
} from "./model";

const BEIGE = "#ECE5D3";
const INK = "#4A4536";
const BLUE = "#2F6BFF";
const CYAN = "#00D4FF";
const VIOLET = "#8B5CF6";

export default function RevealLensStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const size = useElementSize(root);
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useStageInspector(list, "rl-inspector");
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const lens = useRef({ x: size.w / 2, y: size.h / 2 });
  const expand = useRef<{ dir: 1 | -1; at: number } | null>(null);
  const press = useRef<number | null>(null);
  const clock = useRef(0);
  const [revealed, setRevealed] = useState(false);

  const chips = useMemo(
    () => chipSlots(list.length, size.w, size.h, mobile),
    [list.length, size.w, size.h, mobile],
  );
  const files = useMemo(() => {
    const raw = fileSlots(list.length, size.w, size.h, false);
    return rtl ? raw.map((p) => ({ x: size.w - p.x, y: p.y })) : raw;
  }, [list.length, size.w, size.h, rtl]);
  const core = { x: size.w / 2, y: size.h / 2 };
  const chipW = mobile ? 112 : 150;
  const chipH = mobile ? 40 : 46;

  const setExpanded = (on: boolean) => {
    expand.current = { dir: on ? 1 : -1, at: clock.current };
    setRevealed(on);
  };

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
      // Lens position: pointer, else calm Lissajous wander after the idle delay.
      const p = pointer.current;
      const target =
        p && ms - p.at < IDLE_MS
          ? p
          : lissajous(time, size.w, size.h, motion.scale);
      lens.current.x += (target.x - lens.current.x) * 0.14;
      lens.current.y += (target.y - lens.current.y) * 0.14;
      const cover = coverRadius(lens.current.x, lens.current.y, size.w, size.h);
      let radius = mobile ? LENS_RADIUS * 0.85 : LENS_RADIUS;
      const e = expand.current;
      if (still) radius = cover;
      else if (e) {
        const k = Math.min(1, (ms - e.at) / EXPAND_MS);
        radius =
          e.dir === 1
            ? lensRadius(k, radius, cover)
            : lensRadius(1 - k, radius, cover);
      }

      // Legacy world.
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.fillStyle = BEIGE;
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.strokeStyle = "rgba(74,69,54,0.08)";
      for (let x = 0; x < size.w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.h);
        ctx.stroke();
      }
      list.forEach((product, i) => {
        const f = files[i];
        if (!f) return;
        const pts = tanglePath(f, core, i + 2, time);
        ctx.strokeStyle = "rgba(74,69,54,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((q, k) =>
          k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y),
        );
        ctx.stroke();
        ctx.fillStyle = "#F6F1E3";
        ctx.strokeStyle = INK;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.roundRect(f.x - 74, f.y - 22, 148, 44, 6);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = INK;
        ctx.textAlign = "center";
        ctx.direction = "ltr";
        ctx.font = `15px "Cairo Variable", "Cairo", sans-serif`;
        ctx.fillText(legacyFileName(product), f.x, f.y + 5, 136);
        ctx.direction = rtl ? "rtl" : "ltr";
      });
      ctx.fillStyle = "#D8CFB8";
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.roundRect(core.x - 110, core.y - 62, 220, 124, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#101814";
      ctx.fillRect(core.x - 98, core.y - 50, 196, 92);
      ctx.fillStyle = "#39FF6A";
      ctx.font = `17px "Cairo Variable", "Cairo", sans-serif`;
      ctx.fillText(t("ucCrt"), core.x, core.y, 186);

      // Digital world inside the lens.
      const L = lens.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(L.x, L.y, radius, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(
        core.x,
        core.y,
        10,
        core.x,
        core.y,
        Math.max(size.w, size.h),
      );
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(1, "#EAF1FF");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size.w, size.h);
      list.forEach((_, i) => {
        const s = chips[i];
        if (!s) return;
        const route = orthoRoute(s, core);
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        route.forEach((q, k) =>
          k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y),
        );
        ctx.stroke();
        for (let j = 0; j < 3; j++) {
          const q = along(
            route,
            still ? (j + 0.5) / 3 : (time * 0.0004 + j / 3 + i * 0.1) % 1,
          );
          ctx.fillStyle = j % 2 ? VIOLET : CYAN;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      list.forEach((product, i) => {
        const s = chips[i];
        if (!s) return;
        const cg = ctx.createLinearGradient(
          s.x - chipW / 2,
          0,
          s.x + chipW / 2,
          0,
        );
        cg.addColorStop(0, BLUE);
        cg.addColorStop(1, product.comingSoon ? VIOLET : "#1B9FD6");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.roundRect(s.x - chipW / 2, s.y - chipH / 2, chipW, chipH, 12);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.direction = "ltr";
        ctx.font = `700 ${mobile ? 13 : 15}px "Cairo Variable", "Cairo", sans-serif`;
        ctx.fillText(product.name, s.x, s.y + 5, chipW - 14);
        ctx.direction = rtl ? "rtl" : "ltr";
      });
      const r = 52;
      const cg = ctx.createLinearGradient(
        core.x - r,
        core.y - r,
        core.x + r,
        core.y + r,
      );
      cg.addColorStop(0, BLUE);
      cg.addColorStop(0.5, CYAN);
      cg.addColorStop(1, VIOLET);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.roundRect(core.x - r, core.y - r, r * 2, r * 2, 16);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 20px "Cairo Variable", "Cairo", sans-serif`;
      ctx.fillText("E20E", core.x, core.y + 7);
      ctx.restore();
      if (radius < cover - 1) {
        ctx.strokeStyle = "#0F1730";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(L.x, L.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(L.x, L.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    [size.w, size.h, motion.animate, language, mobile, chips, files],
  );

  const local = (e: RPointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  return (
    <div
      ref={root}
      className="rl-stage"
      dir={dir}
      onPointerMove={(e) => {
        pointer.current = { ...local(e), at: clock.current };
      }}
      onPointerDown={(e) => {
        pointer.current = { ...local(e), at: clock.current };
        const startAt = clock.current;
        press.current = window.setTimeout(() => {
          if (clock.current >= startAt) setExpanded(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => press.current && window.clearTimeout(press.current)}
      onPointerLeave={() => press.current && window.clearTimeout(press.current)}
    >
      <canvas ref={canvas} className="rl-canvas" aria-hidden="true" />
      <h2 className="rl-title">{settings.displayTitle}</h2>
      {list.map((product, i) => {
        const s = chips[i];
        if (!s) return null;
        return (
          <button
            key={product.id}
            type="button"
            className="rl-hit"
            style={{
              left: s.x - chipW / 2,
              top: s.y - chipH / 2,
              width: chipW,
              height: chipH,
            }}
            aria-label={fill(t("ucToolLabel"), product.name)}
            onFocus={() => {
              pointer.current = { x: s.x, y: s.y, at: clock.current };
            }}
            onClick={(e) => inspector.open(product.id, e.currentTarget)}
          />
        );
      })}
      <div className="rl-bar">
        <p className="rl-hint">{t("rlHint")}</p>
        {motion.animate ? (
          <button
            type="button"
            className="rl-btn"
            onClick={() => setExpanded(!revealed)}
          >
            {revealed ? t("rlReset") : t("rlRevealAll")}
          </button>
        ) : null}
      </div>
      {inspector.panel}
    </div>
  );
}
