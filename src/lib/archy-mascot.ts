export const ARCHY_GREETING_SESSION_KEY = "e20e-archy-greeted-v1";
export const ARCHY_MUTED_STORAGE_KEY = "e20e-archy-muted-v1";
export const ARCHY_GREETING_VISIBLE_MS = 7_500;
export const ARCHY_HOP_DELAY_MS = 18_000;
/** How long the first greeting waits for the 3D model before falling back to text only. */
export const ARCHY_MODEL_WAIT_MS = 12_000;

export type ArchyAnimation =
  | "Wave"
  | "Idle"
  | "Hop"
  | "Sleep"
  | "Eat"
  | "Think"
  | "Phone"
  | "Read"
  | "Exercise"
  | "Laugh";

type SessionReader = Pick<Storage, "getItem">;
type SessionWriter = Pick<Storage, "setItem">;

/** A route navigation must not replay the greeting; one browser session gets it once. */
export function shouldShowArchyGreeting(
  storage: SessionReader | null,
): boolean {
  try {
    return storage?.getItem(ARCHY_GREETING_SESSION_KEY) !== "shown";
  } catch {
    return true;
  }
}

export function markArchyGreetingShown(storage: SessionWriter | null): void {
  try {
    storage?.setItem(ARCHY_GREETING_SESSION_KEY, "shown");
  } catch {
    // The launcher still works for this mount when session storage is unavailable.
  }
}

export function archyAnimationAfterFinish(
  _clip: ArchyAnimation,
): ArchyAnimation {
  return "Idle";
}

export function shouldAnimateArchy(
  reducedMotion: boolean,
  documentHidden: boolean,
): boolean {
  return !reducedMotion && !documentHidden;
}
