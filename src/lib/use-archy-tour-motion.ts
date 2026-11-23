import { useEffect, type RefObject } from "react";
import {
  ARCHY_TOUR_HAND,
  ARCHY_TOUR_SCALE,
  archyTour,
  quadraticArc,
  tourDuration,
  tourEase,
  type Point,
} from "./archy-tour";

/** Only the launcher writes its own dock transform. React never renders frame positions. */
export function useArchyTourMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    let raf = 0;
    let home: DOMRect | null = null;
    let current: Point = { x: 0, y: 0 };
    let start: Point = current;
    let currentScale = 1;
    let startScale = 1;
    let currentTilt = 0;
    let startTilt = 0;
    let previous = "idle";
    let direction = -1;
    const clear = () => {
      dock.style.removeProperty("transform");
      dock.style.removeProperty("transform-origin");
      dock.style.removeProperty("will-change");
      dock.querySelector<HTMLElement>(".archy-bubble")?.style.removeProperty("translate");
      home = null;
      current = { x: 0, y: 0 };
      currentScale = 1;
      currentTilt = 0;
    };
    const frame = (now: number) => {
      const state = archyTour.getSnapshot();
      if (state.phase === "idle" || state.phase === "rewind") {
        if (previous !== state.phase) clear();
        previous = state.phase;
        raf = 0;
        return;
      }
      if (!home) {
        clear();
        home = dock.getBoundingClientRect();
      }
      if (state.phase !== previous) {
        start = { ...current };
        startScale = currentScale;
        startTilt = currentTilt;
        previous = state.phase;
      }
      const grip = state.grip?.getBoundingClientRect();
      if (grip && state.phase === "fly") {
        // Direction comes from the real legacy grip position, not language assumptions.
        const board = state.grip?.closest(".tb-board")?.getBoundingClientRect();
        if (board) direction = grip.left + grip.width / 2 > board.left + board.width / 2 ? -1 : 1;
      }
      const tilt = direction * 8;
      const scale = ARCHY_TOUR_SCALE;
      const hand = direction < 0 ? ARCHY_TOUR_HAND.right : ARCHY_TOUR_HAND.left;
      const radians = (tilt * Math.PI) / 180;
      // Top-left transform origin makes the hand equation invariant to toolbar/bubble height.
      const hx = scale * (hand.x * Math.cos(radians) - hand.y * Math.sin(radians));
      const hy = scale * (hand.x * Math.sin(radians) + hand.y * Math.cos(radians));
      const target = grip
        ? {
            x: grip.left + grip.width / 2 - home.left - hx,
            y: grip.top + grip.height / 2 - home.top - hy,
          }
        : current;
      if (state.phase === "fly" || state.phase === "return") {
        const e = tourEase((now - state.phaseStarted) / tourDuration(state.phase, state.scale));
        const end = state.phase === "return" ? { x: 0, y: 0 } : target;
        current = quadraticArc(
          start,
          { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 120 },
          end,
          e,
        );
        currentScale = startScale + ((state.phase === "return" ? 1 : scale) - startScale) * e;
        currentTilt = startTilt + ((state.phase === "return" ? 0 : tilt) - startTilt) * e;
      } else {
        current = target;
        currentScale = scale;
        currentTilt = tilt;
      }
      dock.style.transformOrigin = "0 0";
      dock.style.willChange = "transform";
      dock.style.transform = `translate(${current.x}px, ${current.y}px) scale(${currentScale}) rotate(${currentTilt}deg)`;
      const bubble = dock.querySelector<HTMLElement>(".archy-bubble");
      if (bubble) {
        bubble.style.removeProperty("translate");
        const box = bubble.getBoundingClientRect();
        const dx =
          box.left < 12
            ? 12 - box.left
            : box.right > window.innerWidth - 12
              ? window.innerWidth - 12 - box.right
              : 0;
        const dy =
          box.top < 12
            ? 12 - box.top
            : box.bottom > window.innerHeight - 12
              ? window.innerHeight - 12 - box.bottom
              : 0;
        // Convert viewport correction through the dock's rotated/scaled coordinate space.
        const angle = (currentTilt * Math.PI) / 180;
        bubble.style.translate = `${(dx * Math.cos(angle) + dy * Math.sin(angle)) / currentScale}px ${(-dx * Math.sin(angle) + dy * Math.cos(angle)) / currentScale}px`;
      }
      raf = requestAnimationFrame(frame);
    };
    const update = () => {
      const phase = archyTour.getSnapshot().phase;
      if (phase === "idle") {
        cancelAnimationFrame(raf);
        raf = 0;
        previous = "idle";
        clear();
      } else if (!raf) raf = requestAnimationFrame(frame);
    };
    const unsubscribe = archyTour.subscribe(update);
    update();
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      clear();
    };
  }, [ref]);
}
