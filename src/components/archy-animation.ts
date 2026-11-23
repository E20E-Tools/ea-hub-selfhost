import { LoopOnce, LoopRepeat, type AnimationAction } from "three";
import type { ArchyAnimation } from "@/lib/archy-mascot";

export type ArchyActions = Partial<Record<ArchyAnimation, AnimationAction>>;

export function playArchyClip(actions: ArchyActions, clip: ArchyAnimation): void {
  const next = actions[clip];
  if (!next) return;
  for (const action of Object.values(actions)) {
    if (action && action !== next) action.fadeOut(0.2);
  }
  next.reset();
  next.setLoop(clip === "Idle" ? LoopRepeat : LoopOnce, clip === "Idle" ? Infinity : 1);
  next.clampWhenFinished = clip !== "Idle";
  next.fadeIn(0.2).play();
}

/** Wave and Hop always crossfade back to the looping Idle clip. */
export function finishArchyClip(actions: ArchyActions, finished: AnimationAction): void {
  const name = finished.getClip().name as ArchyAnimation;
  if (name !== "Idle") playArchyClip(actions, "Idle");
}
