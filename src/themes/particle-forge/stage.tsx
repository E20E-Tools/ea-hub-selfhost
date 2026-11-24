import { useEffect, useMemo, useRef } from "react";
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
import {
  clusterCentres,
  clusterTargets,
  formationAt,
  gridTargets,
  particleCount,
  repel,
  sampleText,
  type Pt,
} from "./model";

const NAVY = "#0F1730";
const COLORS = ["#2F6BFF", "#00D4FF", "#8B5CF6"];

function titleTargets(
  text: string,
  n: number,
  w: number,
  h: number,
  mobile: boolean,
): Pt[] {
  if (typeof document === "undefined") return [];
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  let fontSize = mobile ? 56 : 120;
  ctx.font = `800 ${fontSize}px "Sora", "IBM Plex Sans Arabic", sans-serif`;
  while (fontSize > 24 && ctx.measureText(text).width > w * 0.86) {
    fontSize -= 6;
    ctx.font = `800 ${fontSize}px "Sora", "IBM Plex Sans Arabic", sans-serif`;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.45);
  try {
    return sampleText(
      ctx.getImageData(0, 0, c.width, c.height).data,
      c.width,
      c.height,
      n,
      mobile ? 3 : 4,
    );
  } catch {
    return [];
  }
}

export default function ParticleForgeStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const size = useElementSize(root);
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useStageInspector(list, "pf-inspector");
  const n = particleCount(mobile, motion.scale);
  const pointer = useRef<Pt | null>(null);
  const state = useRef<{ pos: Float32Array; vel: Float32Array }>({
    pos: new Float32Array(0),
    vel: new Float32Array(0),
  });

  const centres = useMemo(
    () => clusterCentres(list.length, size.w, size.h),
    [list.length, size.w, size.h],
  );
  const targets = useMemo(() => {
    const radius = Math.min(60, size.w / Math.max(4, list.length * 2.6));
    const title = titleTargets(
      settings.displayTitle || "E20E",
      n,
      size.w,
      size.h,
      mobile,
    );
    return {
      grid: gridTargets(n, size.w, size.h),
      clusters: clusterTargets(n, centres, radius),
      title: title.length
        ? title
        : clusterTargets(n, [{ x: size.w / 2, y: size.h / 2 }], size.h * 0.3),
      radius,
    };
  }, [n, size.w, size.h, centres, list.length, settings.displayTitle, mobile]);

  useEffect(() => {
    const pos = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 2] = (((i * 97) % 1000) / 1000) * size.w;
      pos[i * 2 + 1] = (((i * 61) % 1000) / 1000) * size.h;
    }
    state.current = { pos, vel: new Float32Array(n * 2) };
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrameLoop(
    motion.running,
    (ms, dt) => {
      const c = canvas.current;
      if (!c) return;
      const ctx = prepareCanvas(c, size.w, size.h);
      if (!ctx) return;
      const still = !motion.animate;
      const f = still
        ? { formation: "clusters" as const, index: 1, k: 1 }
        : formationAt(ms * Math.min(1.3, motion.scale));
      const set =
        f.formation === "grid"
          ? targets.grid
          : f.formation === "clusters"
            ? targets.clusters
            : targets.title;
      ctx.fillStyle = NAVY;
      ctx.fillRect(0, 0, size.w, size.h);
      const { pos, vel } = state.current;
      const step = Math.min(2, dt / 16.7);
      for (let i = 0; i < n; i++) {
        const tg = set[i] ?? { x: size.w / 2, y: size.h / 2 };
        let x = pos[i * 2] ?? 0;
        let y = pos[i * 2 + 1] ?? 0;
        if (still) {
          x = tg.x;
          y = tg.y;
        } else {
          const jitter =
            f.formation === "grid" ? Math.sin(ms * 0.02 + i) * 0.8 : 0;
          const push = repel({ x, y }, pointer.current, 80, 6);
          let vx =
            (vel[i * 2] ?? 0) * 0.86 + (tg.x - x) * 0.045 * step + push.x;
          let vy =
            (vel[i * 2 + 1] ?? 0) * 0.86 +
            (tg.y + jitter - y) * 0.045 * step +
            push.y;
          vx = Math.max(-30, Math.min(30, vx));
          vy = Math.max(-30, Math.min(30, vy));
          x += vx * step;
          y += vy * step;
          vel[i * 2] = vx;
          vel[i * 2 + 1] = vy;
        }
        pos[i * 2] = x;
        pos[i * 2 + 1] = y;
        ctx.fillStyle =
          f.formation === "grid"
            ? "#ECE5D3"
            : COLORS[
                (f.formation === "clusters"
                  ? i % Math.max(1, list.length)
                  : i) % 3
              ]!;
        ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
      }
      if (f.formation === "clusters") {
        const alpha = still ? 1 : Math.min(1, f.k * 3);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = "center";
        ctx.direction = "ltr";
        ctx.font = `600 ${mobile ? 12 : 14}px "Sora", sans-serif`;
        list.forEach((p, i) => {
          const cc = centres[i];
          if (cc)
            ctx.fillText(
              p.name,
              cc.x,
              cc.y + targets.radius + 22,
              size.w / Math.max(1, list.length) - 8,
            );
        });
      }
    },
    [size.w, size.h, motion.animate, targets, language],
  );

  const hit = targets.radius * 2 + 20;
  return (
    <div
      ref={root}
      className="pf-stage"
      dir={dir}
      onPointerMove={(e) => {
        const r = root.current?.getBoundingClientRect();
        if (r)
          pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <canvas ref={canvas} className="pf-canvas" aria-hidden="true" />
      <h2 className="sr-only">{settings.displayTitle}</h2>
      {list.map((product, i) => {
        const c = centres[i];
        if (!c) return null;
        return (
          <button
            key={product.id}
            type="button"
            className="pf-hit"
            style={{
              left: c.x - hit / 2,
              top: c.y - hit / 2,
              width: hit,
              height: hit + 24,
            }}
            aria-label={fill(t("ucToolLabel"), product.name)}
            onClick={(e) => inspector.open(product.id, e.currentTarget)}
          />
        );
      })}
      <p className="pf-hint">{t("pfHint")}</p>
      {inspector.panel}
    </div>
  );
}
