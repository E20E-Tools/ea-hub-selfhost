import type { ArchyAnimation } from "./archy-mascot";

export const ARCHY_TOUR_KEY = "e20e-archy-drag-tour-v1";
export const ARCHY_TOUR_PHASES = [
  "rewind",
  "fly",
  "grab",
  "drag",
  "celebrate",
  "return",
] as const;
export type ArchyTourPhase = "idle" | (typeof ARCHY_TOUR_PHASES)[number];
export const ARCHY_TOUR_MS = {
  wait: 250,
  rewind: 500,
  fly: 1100,
  grab: 300,
  drag: 3600,
  celebrate: 2200,
  return: 1000,
} as const;
/** Hand on the leading edge of the 168px character, measured from its top-left. */
export const ARCHY_TOUR_HAND = {
  left: { x: 38, y: 102 },
  right: { x: 130, y: 102 },
} as const;
export const ARCHY_TOUR_SCALE = 0.8;
export type Point = { x: number; y: number };

export function shouldRunArchyTour(
  storage: Pick<Storage, "getItem"> | null,
  forced = false,
) {
  if (forced) return true;
  try {
    return storage?.getItem(ARCHY_TOUR_KEY) !== "done";
  } catch {
    return true;
  }
}
export function markArchyTourDone(storage: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(ARCHY_TOUR_KEY, "done");
  } catch {
    /* private browsing */
  }
}
export function archyTourStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export function tourEase(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}
export function quadraticArc(
  start: Point,
  control: Point,
  end: Point,
  t: number,
): Point {
  const x = Math.max(0, Math.min(1, t));
  return {
    x: (1 - x) ** 2 * start.x + 2 * (1 - x) * x * control.x + x ** 2 * end.x,
    y: (1 - x) ** 2 * start.y + 2 * (1 - x) * x * control.y + x ** 2 * end.y,
  };
}
export function tourDuration(phase: keyof typeof ARCHY_TOUR_MS, scale: number) {
  return ARCHY_TOUR_MS[phase] / Math.max(0.1, scale);
}

export const ARCHY_TOUR_SPEECH_CAP_MS = 6_000;
export function archyTourNeedsRewind(handle: number) {
  return handle < 0.98;
}

/** The tour waits for the delivered greeting, not for its bubble's display timer. */
export function archyTourRobotReady({
  greetingChecked,
  sceneFinal,
  greetingPending,
  greetingStartedAt,
  now,
  animation,
  speaking,
  open,
  hidden,
}: {
  greetingChecked: boolean;
  sceneFinal: boolean;
  greetingPending: boolean;
  greetingStartedAt: number | null;
  now: number;
  animation: ArchyAnimation;
  speaking: boolean;
  open: boolean;
  hidden: boolean;
}) {
  if (!greetingChecked || !sceneFinal || greetingPending || open || hidden)
    return false;
  // A session that was already greeted has no Wave or speech to await.
  if (greetingStartedAt === null) return true;
  const speechDone =
    !speaking || now - greetingStartedAt >= ARCHY_TOUR_SPEECH_CAP_MS;
  return animation === "Idle" && speechDone;
}

export type ArchyTourSnapshot = {
  robotPresent: boolean;
  robotReady: boolean;
  phase: ArchyTourPhase;
  bubble: "archyTourIntro" | "archyTourDone" | null;
  clip: ArchyAnimation;
  clipRequest: number;
  cancelSignal: number;
  cancelSnap: boolean;
  forced: boolean;
  scale: number;
  phaseStarted: number;
  grip: HTMLElement | null;
};
const initial: ArchyTourSnapshot = {
  robotPresent: false,
  robotReady: false,
  phase: "idle",
  bubble: null,
  clip: "Idle",
  clipRequest: 0,
  cancelSignal: 0,
  cancelSnap: false,
  forced: false,
  scale: 1,
  phaseStarted: 0,
  grip: null,
};
let snapshot = initial;
const listeners = new Set<() => void>();
export const archyTour = {
  getSnapshot: () => snapshot,
  getServerSnapshot: () => initial,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  update: (patch: Partial<ArchyTourSnapshot>) => {
    if (
      Object.entries(patch).every(
        ([key, value]) => snapshot[key as keyof ArchyTourSnapshot] === value,
      )
    )
      return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  },
};
export function requestArchyTourClip(clip: ArchyAnimation) {
  archyTour.update({ clip, clipRequest: snapshot.clipRequest + 1 });
}
export function cancelArchyTour(snap = false) {
  archyTour.update({
    cancelSignal: snapshot.cancelSignal + 1,
    cancelSnap: snap,
  });
}
export function setArchyTourPhase(
  phase: ArchyTourPhase,
  bubble: ArchyTourSnapshot["bubble"] = null,
) {
  archyTour.update({ phase, bubble, phaseStarted: performance.now() });
}
export function resetArchyTour() {
  archyTour.update({ phase: "idle", bubble: null, grip: null, forced: false });
  requestArchyTourClip("Idle");
}
