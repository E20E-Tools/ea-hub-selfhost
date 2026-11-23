import { useEffect, useState, type RefObject } from "react";
import { INTENSITY_SCALE, type AnimationIntensity } from "@/lib/design-themes";

export type StageMotion = {
  /** Motion allowed by the admin setting and the visitor's reduced-motion preference. */
  animate: boolean;
  /** Animate and currently visible (on screen, tab shown). Loops must stop when false. */
  running: boolean;
  intensity: AnimationIntensity;
  /** Speed / particle multiplier for the intensity level. */
  scale: number;
  lessMotion?: boolean;
  toggleLessMotion?: () => void;
};

function readPrefs() {
  const el = document.documentElement;
  const level = el.dataset["motionIntensity"];
  return {
    motion: el.dataset["motion"] !== "off",
    intensity: (level === "low" || level === "high"
      ? level
      : "medium") as AnimationIntensity,
  };
}

/**
 * Shared motion contract for every theme stage. Sets `data-paused` (CSS loops use
 * animation-play-state) and `data-motion` on the stage root.
 */
export function useStageMotion(
  ref: RefObject<HTMLElement | null>,
): StageMotion {
  const [prefs, setPrefs] = useState({
    motion: true,
    intensity: "medium" as AnimationIntensity,
  });
  const [lessMotion, setLessMotion] = useState(false);
  useEffect(() => {
    try {
      setLessMotion(localStorage.getItem("ea-less-motion") === "1");
    } catch {}
  }, []);
  const toggleLessMotion = () => {
    setLessMotion(!lessMotion);
    try {
      localStorage.setItem("ea-less-motion", lessMotion ? "0" : "1");
    } catch {}
  };
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabShown, setTabShown] = useState(true);

  useEffect(() => {
    setPrefs(readPrefs());
    const mo = new MutationObserver(() => setPrefs(readPrefs()));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion", "data-motion-intensity"],
    });
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(Boolean(mq?.matches));
    onMq();
    mq?.addEventListener?.("change", onMq);
    const onVis = () => setTabShown(document.visibilityState !== "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setOnScreen(Boolean(entry?.isIntersecting)),
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref]);

  const animate = prefs.motion && !reduced && !lessMotion;
  const running = animate && onScreen && tabShown;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset["motion"] = animate ? "on" : "off";
    node.toggleAttribute("data-paused", animate && !running);
  }, [ref, animate, running]);

  return {
    lessMotion,
    toggleLessMotion,
    animate,
    running,
    intensity: prefs.intensity,
    scale: INTENSITY_SCALE[prefs.intensity],
  };
}
