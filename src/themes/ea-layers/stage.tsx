import { useMemo, useRef } from "react";
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
  chipWidth,
  EA_LAYERS,
  explodeAt,
  groupByLayer,
  iso,
  layerFor,
  slotOnLayer,
  type EaLayer,
} from "./model";

/** Calm per-layer tints, top (business) to bottom (technology). */
const LAYER_COLORS: Record<EaLayer, { fill: string; edge: string }> = {
  business: { fill: "rgba(139,92,246,0.16)", edge: "#8B5CF6" },
  applications: { fill: "rgba(47,107,255,0.16)", edge: "#2F6BFF" },
  data: { fill: "rgba(0,212,255,0.18)", edge: "#0AA5C8" },
  technology: { fill: "rgba(74,69,54,0.14)", edge: "#4A4536" },
};
const LABEL_KEY = {
  business: "elBusiness",
  applications: "elApplications",
  data: "elData",
  technology: "elTechnology",
} as const;

export default function EaLayersStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<(HTMLButtonElement | null)[]>([]);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const size = useElementSize(root);
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useStageInspector(list, "el-inspector");
  const groups = useMemo(() => groupByLayer(list), [list]);

  useFrameLoop(
    motion.running,
    (ms) => {
      const c = canvas.current;
      if (!c) return;
      const ctx = prepareCanvas(c, size.w, size.h);
      if (!ctx) return;
      const still = !motion.animate;
      const time = still ? 0 : ms * Math.min(1.4, motion.scale);
      const explode = still ? 1 : explodeAt(time);
      ctx.clearRect(0, 0, size.w, size.h);
      const gapMax = mobile ? 80 : 70;
      const s = Math.max(
        60,
        Math.min(size.w * (mobile ? 0.4 : 0.3), (size.h - 3 * gapMax - 170) / 2, 260),
      );
      const cx = size.w / 2;
      const gap = (mobile ? 46 : 38) + explode * (gapMax - (mobile ? 46 : 38));
      const base = size.h / 2 + 30 + 1.5 * gap;
      const zOf = (li: number) => (EA_LAYERS.length - 1 - li) * gap;
      const chipPos = new Map<string, { x: number; y: number; w: number }>();
      // Bottom first so upper layers paint on top.
      [...EA_LAYERS].reverse().forEach((layer) => {
        const li = EA_LAYERS.indexOf(layer);
        const z = zOf(li);
        const corners = [
          iso(-1, -1, z, cx, base, s),
          iso(1, -1, z, cx, base, s),
          iso(1, 1, z, cx, base, s),
          iso(-1, 1, z, cx, base, s),
        ];
        ctx.beginPath();
        corners.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = LAYER_COLORS[layer].fill;
        ctx.fill();
        ctx.strokeStyle = LAYER_COLORS[layer].edge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const edge = rtl ? corners[0]! : corners[1]!;
        ctx.fillStyle = "#0F1730";
        ctx.direction = rtl ? "rtl" : "ltr";
        ctx.textAlign = rtl ? "right" : "left";
        ctx.font = `600 ${mobile ? 12 : 14}px "Sora", "IBM Plex Sans Arabic", sans-serif`;
        ctx.fillText(t(LABEL_KEY[layer]), edge.x + (rtl ? -10 : 10), edge.y + 4);
        const items = groups[layer];
        items.forEach((p, j) => {
          const slot = slotOnLayer(j, items.length);
          const fall = still
            ? 0
            : Math.max(0, Math.min(1, 1 - (ms / 900 - j * 0.2 - (3 - li) * 0.25)));
          const q = iso(slot.x, slot.y, z + 10 + fall * fall * 160, cx, base, s);
          const w = chipWidth(items.length, s, mobile ? 104 : 130);
          chipPos.set(p.id, { ...q, w });
          ctx.fillStyle = LAYER_COLORS[layer].edge;
          ctx.beginPath();
          ctx.roundRect(q.x - w / 2, q.y - 14, w, 28, 8);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.direction = "ltr";
          ctx.font = `700 ${mobile ? 11 : 13}px "Sora", sans-serif`;
          let label = p.name;
          while (label.length > 3 && ctx.measureText(label).width > w - 10)
            label = label.slice(0, -1);
          ctx.fillText(label === p.name ? label : `${label.slice(0, -1)}…`, q.x, q.y + 4);
        });
      });
      // Dotted links between adjacent layers with travelling particles.
      for (let li = 0; li < EA_LAYERS.length - 1; li++) {
        for (const side of [-0.7, 0.7]) {
          const a = iso(side, 0.75, zOf(li), cx, base, s);
          const b = iso(side, 0.75, zOf(li + 1), cx, base, s);
          ctx.strokeStyle = "rgba(15,23,48,0.45)";
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
          const k = still ? 0.5 : (time * 0.0006 + li * 0.3 + (side > 0 ? 0.5 : 0)) % 1;
          ctx.fillStyle = side > 0 ? "#00D4FF" : "#8B5CF6";
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      list.forEach((p, i) => {
        const el = hits.current[i];
        const q = chipPos.get(p.id);
        if (!el || !q) return;
        el.style.width = `${q.w}px`;
        el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%)`;
      });
    },
    [size.w, size.h, motion.animate, groups, language, mobile],
  );

  return (
    <div ref={root} className="el-stage" dir={dir}>
      <canvas ref={canvas} className="el-canvas" aria-hidden="true" />
      <h2 className="el-title">{settings.displayTitle}</h2>
      <p className="el-hint">{t("elHint")}</p>
      {list.map((product, i) => (
        <button
          key={product.id}
          ref={(el) => {
            hits.current[i] = el;
          }}
          type="button"
          className="el-hit"
          aria-label={`${fill(t("ucToolLabel"), product.name)} · ${t(LABEL_KEY[layerFor(product)])}`}
          onClick={(e) => inspector.open(product.id, e.currentTarget)}
        />
      ))}
      {inspector.panel}
    </div>
  );
}
