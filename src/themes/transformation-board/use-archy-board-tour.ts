import { trackProductEvent } from "@/lib/metrics-consent";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { featureEnabled } from "@/lib/site-features";
import {
  archyTour,
  ARCHY_TOUR_MS,
  archyTourStorage,
  archyTourNeedsRewind,
  markArchyTourDone,
  requestArchyTourClip,
  resetArchyTour,
  setArchyTourPhase,
  shouldRunArchyTour,
} from "@/lib/archy-tour";
import type { StageMotion } from "../use-stage-motion";
import type { SiteSettings } from "@/lib/catalog";
import { startBrowserTourVisit, updateBrowserTourVisit } from "@/lib/archy-tour-visit-client";

export function archyBoardTourEligible(settings: SiteSettings, animate: boolean) {
  return (
    animate &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset["motion"] !== "off" &&
    window.innerWidth >= 640 &&
    featureEnabled(settings.featureFlags, "assistant") &&
    shouldRunArchyTour(
      archyTourStorage(),
      archyTour.getSnapshot().forced ||
        new URLSearchParams(window.location.search).get("archyTour") === "1",
    )
  );
}

type Options = {
  root: RefObject<HTMLDivElement | null>;
  board: RefObject<HTMLDivElement | null>;
  motion: StageMotion;
  mobile: boolean;
  settings: SiteSettings;
  booting: boolean;
  glide: (to: number, ms: number, done?: () => void) => void;
  getHandle: () => number;
  takeOver: () => void;
  stopTravel: () => void;
  onPendingChange: (pending: boolean) => void;
};

/** The board owns every handle change; the robot only follows the measured grip. */
export function useArchyBoardTour(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const { root, board, motion, mobile, settings } = options;
  const assistant = featureEnabled(settings.featureFlags, "assistant");
  const forced = useSyncExternalStore(
    archyTour.subscribe,
    () => archyTour.getSnapshot().forced,
    () => false,
  );
  useEffect(() => {
    if (!motion.animate) {
      latest.current.onPendingChange(false);
      markArchyTourDone(archyTourStorage());
      return;
    }
    if (mobile || window.innerWidth < 640 || !assistant) {
      latest.current.onPendingChange(false);
      return;
    }
    if (
      !shouldRunArchyTour(
        archyTourStorage(),
        archyTour.getSnapshot().forced ||
          new URLSearchParams(window.location.search).get("archyTour") === "1",
      )
    ) {
      latest.current.onPendingChange(false);
      return;
    }
    const node = root.current;
    const boardNode = board.current;
    const grip = boardNode?.querySelector<HTMLElement>(".tb-grip");
    if (!node || !boardNode || !grip) return;
    let raf = 0;
    let timer = 0;
    let pending = true;
    let active = false;
    let returning = false;
    let stopped = false;
    let readySince: number | null = null;
    let signal = archyTour.getSnapshot().cancelSignal;
    const clearTimer = () => {
      window.clearTimeout(timer);
      timer = 0;
    };
    const wait = (ms: number, next: () => void) => {
      clearTimer();
      timer = window.setTimeout(() => {
        timer = 0;
        if (!stopped) next();
      }, ms / motion.scale);
    };
    const release = () => {
      grip.removeAttribute("data-archy-grab");
      boardNode.removeAttribute("data-archy-dragging");
    };
    const finish = () => {
      active = false;
      returning = false;
      release();
      resetArchyTour();
    };
    const flyHome = (snap: boolean) => {
      if (snap || !active) {
        finish();
        return;
      }
      returning = true;
      setArchyTourPhase("return");
      requestArchyTourClip("Hop");
      wait(ARCHY_TOUR_MS.return, finish);
    };
    const cancel = (snap = false) => {
      if ((!pending && !active) || stopped) return;
      pending = false;
      latest.current.onPendingChange(false);
      markArchyTourDone(archyTourStorage());
      if (returning && !snap) return;
      clearTimer();
      cancelAnimationFrame(raf);
      if (active && !returning) latest.current.stopTravel();
      release();
      flyHome(snap);
    };
    const fly = () => {
      markArchyTourDone(archyTourStorage());
      setArchyTourPhase("fly", "archyTourIntro");
      requestArchyTourClip("Hop");
      wait(ARCHY_TOUR_MS.fly, () => {
        setArchyTourPhase("grab", "archyTourIntro");
        grip.setAttribute("data-archy-grab", "");
        boardNode.setAttribute("data-archy-dragging", "");
        wait(ARCHY_TOUR_MS.grab, () => {
          setArchyTourPhase("drag", "archyTourIntro");
          latest.current.glide(0, ARCHY_TOUR_MS.drag, () => {
            release();
            trackProductEvent("project.archy_tour_completed");
            updateBrowserTourVisit("completed");
            setArchyTourPhase("celebrate", "archyTourDone");
            requestArchyTourClip("Wave");
            wait(ARCHY_TOUR_MS.celebrate, () => flyHome(false));
          });
        });
      });
    };
    const begin = () => {
      pending = false;
      active = true;
      trackProductEvent("project.archy_tour_started");
      startBrowserTourVisit();
      latest.current.onPendingChange(false);
      latest.current.stopTravel();
      latest.current.takeOver();
      archyTour.update({ grip, scale: motion.scale });
      if (archyTourNeedsRewind(latest.current.getHandle())) {
        setArchyTourPhase("rewind", "archyTourIntro");
        requestArchyTourClip("Hop");
        latest.current.glide(1, ARCHY_TOUR_MS.rewind, fly);
      } else {
        fly();
      }
    };
    const isReady = () => {
      const robot = archyTour.getSnapshot();
      const box = boardNode.getBoundingClientRect();
      const visibleW = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(0, box.left));
      const visibleH = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(0, box.top));
      const fraction = (visibleW * visibleH) / Math.max(1, box.width * box.height);
      return robot.robotReady && !latest.current.booting && !document.hidden && fraction >= 0.7;
    };
    const check = (now: number) => {
      if (!pending || stopped) return;
      if (!isReady()) {
        readySince = null;
        clearTimer();
      } else if (readySince === null) {
        readySince = now;
        // Start the 250ms timer immediately; do not wait for another slow animation frame.
        wait(ARCHY_TOUR_MS.wait, () => {
          if (isReady()) begin();
          else readySince = null;
        });
      }
      if (pending && !stopped) raf = requestAnimationFrame(check);
    };
    const pointer = () => cancel();
    const gripKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest(".tb-grip")) cancel();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel(true);
    };
    const unsubscribe = archyTour.subscribe(() => {
      const state = archyTour.getSnapshot();
      if (signal !== state.cancelSignal) {
        signal = state.cancelSignal;
        cancel(state.cancelSnap);
      }
      if (!state.robotPresent) cancel(true);
      if (pending && state.robotReady && readySince === null) {
        cancelAnimationFrame(raf);
        check(performance.now());
      }
    });
    boardNode.addEventListener("pointerdown", pointer, true);
    boardNode.addEventListener("keydown", gripKey, true);
    document.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hidden);
    raf = requestAnimationFrame(check);
    return () => {
      stopped = true;
      clearTimer();
      cancelAnimationFrame(raf);
      unsubscribe();
      boardNode.removeEventListener("pointerdown", pointer, true);
      boardNode.removeEventListener("keydown", gripKey, true);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hidden);
      if (active) {
        latest.current.stopTravel();
        markArchyTourDone(archyTourStorage());
        resetArchyTour();
      }
      release();
    };
  }, [root, board, motion.animate, motion.scale, mobile, assistant, forced]);
}
