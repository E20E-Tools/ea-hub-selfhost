// Server-free so any component can check the privacy choice without pulling in server functions.
export const METRICS_OPT_OUT_KEY = "e20e-metrics-opt-out-v1";
export const METRICS_PREFERENCE_EVENT = "e20e-metrics-preference";

/** True when the browser sends Global Privacy Control or Do Not Track. */
export function browserPrivacySignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };
  const win =
    typeof window === "undefined"
      ? undefined
      : (window as { doNotTrack?: string });
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return nav.globalPrivacyControl === true || dnt === "1" || dnt === "yes";
}
// Session fallback so a choice still applies when browser storage is blocked.
let memoryOptOut: boolean | null = null;
let memorySaved = true;
export function metricsOptedOut(): boolean {
  // Readable storage is authoritative so a choice made in another tab applies here too;
  // the in-memory choice is used only while storage is blocked.
  if (memoryOptOut !== null && !memorySaved) return memoryOptOut;
  try {
    return window.localStorage.getItem(METRICS_OPT_OUT_KEY) === "1";
  } catch {
    return memoryOptOut ?? false;
  }
}
/** Aggregate event counting is allowed only without a privacy signal or a saved opt-out. */
export function metricsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return !browserPrivacySignal() && !metricsOptedOut();
}
/** Returns false when the choice could not be saved (storage blocked). */
export function setMetricsOptOut(optOut: boolean): boolean {
  let saved = true;
  memoryOptOut = optOut;
  try {
    if (optOut) window.localStorage.setItem(METRICS_OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(METRICS_OPT_OUT_KEY);
  } catch {
    saved = false;
  }
  memorySaved = saved;
  window.dispatchEvent(new Event(METRICS_PREFERENCE_EVENT));
  return saved;
}

/**
 * Optional product analytics: skipped under GPC/DNT or the local opt-out, and collector
 * failures are contained so they can never turn a confirmed action into a UI failure.
 */
export function trackProductEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (!metricsAllowed()) return;
    window.dispatchEvent(
      new CustomEvent("e20e-product-event", { detail: { name, properties } }),
    );
  } catch {
    /* analytics is optional */
  }
}
