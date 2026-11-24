/**
 * Small shared helpers for the canvas-driven designs (untangle-chaos, reveal-lens,
 * problem-to-tool, particle-forge, flip-deck, ea-layers). Browser-only hooks; no React state per frame.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Product } from "@/lib/catalog";
import { InspectorPanel, useProductInspector } from "./product-inspector";

/** Phone layout (< 640px). */
export function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 639px)");
    if (!mq) return;
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** Tracks an element's CSS size (re-renders only on resize). */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  fallback = { w: 1100, h: 620 },
) {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Sizes a canvas for the device pixel ratio and returns its 2D context scaled to CSS pixels. */
export function prepareCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * requestAnimationFrame loop that runs only while `running`; the callback gets elapsed
 * milliseconds (accumulated, so pausing freezes time). When not running, `draw(still)` is
 * called once so the stage shows a clear still frame.
 */
export function useFrameLoop(
  running: boolean,
  frame: (elapsedMs: number, dtMs: number) => void,
  deps: readonly unknown[] = [],
) {
  const cb = useRef(frame);
  cb.current = frame;
  const elapsed = useRef(0);
  useEffect(() => {
    if (!running) {
      cb.current(elapsed.current, 0);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      elapsed.current += dt;
      cb.current(elapsed.current, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Inspector state plus the panel element every new design renders. */
export function useStageInspector(products: Product[], className: string) {
  const inspector = useProductInspector();
  const product = products.find((p) => p.id === inspector.openId) ?? null;
  const panel = product ? (
    <InspectorPanel
      product={product}
      title={<span dir="ltr">{product.name}</span>}
      onClose={inspector.close}
      className={className}
    />
  ) : null;
  return { ...inspector, panel };
}
