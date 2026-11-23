import { recordJourneyEvent } from "./journey.functions";
import type { PublicJourneyEvent } from "./journey.shared";

export {
  METRICS_OPT_OUT_KEY,
  METRICS_PREFERENCE_EVENT,
  browserPrivacySignal,
  metricsOptedOut,
  metricsAllowed,
  setMetricsOptOut,
  trackProductEvent,
} from "./metrics-consent";
import { metricsAllowed } from "./metrics-consent";

const pending = new Map<string, Promise<boolean>>();
function eventStorageKey(event: string) {
  return `e20e-journey-${event}-v1`;
}

/**
 * Called only from real visitor actions, never render. Session events reuse one random key.
 * Records an anonymous event count (no person, device or visitor identifier).
 */
export function trackJourney(
  event: PublicJourneyEvent,
  language: "ar" | "en",
  options: { eventKey?: string; rating?: number; oncePerSession?: boolean } = {},
): Promise<boolean> {
  if (typeof window === "undefined" || !metricsAllowed()) return Promise.resolve(false);
  const scopedEvent = ["exercise_started","exercise_completed","exercise_requested","case_viewed","case_opened","service_started","service_receipt"].includes(event) ? event+"-"+language : event;
  let eventKey = options.eventKey ?? "";
  try {
    if (options.oncePerSession && sessionStorage.getItem(eventStorageKey(scopedEvent)) === "done")
      return Promise.resolve(false);
    if (options.oncePerSession) {
      eventKey = sessionStorage.getItem(`${eventStorageKey(scopedEvent)}-key`) ?? crypto.randomUUID();
      sessionStorage.setItem(`${eventStorageKey(scopedEvent)}-key`, eventKey);
    }
  } catch {
    /* storage is optional */
  }
  eventKey ||= crypto.randomUUID();
  const pendingKey = `${event}:${eventKey}`;
  const existing = pending.get(pendingKey);
  if (existing) return existing;
  const call = recordJourneyEvent({
    data: { event, language, eventKey, rating: options.rating ?? null },
  })
    .then((result) => {
      if (result.ok && options.oncePerSession) {
        try {
          sessionStorage.setItem(eventStorageKey(scopedEvent), "done");
        } catch {
          /* optional */
        }
      }
      return result.ok;
    })
    .catch(() => false)
    .finally(() => pending.delete(pendingKey));
  pending.set(pendingKey, call);
  return call;
}
