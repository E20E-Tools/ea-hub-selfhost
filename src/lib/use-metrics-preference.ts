import { useEffect, useState } from "react";
import {
  browserPrivacySignal,
  METRICS_PREFERENCE_EVENT,
  metricsOptedOut,
} from "./journey-client";

export type MetricsPreferenceState = { signal: boolean; optedOut: boolean };

/** Reads the preference after hydration and follows changes from other controls on the page. */
export function useMetricsPreference(): MetricsPreferenceState | null {
  const [preference, setPreference] = useState<MetricsPreferenceState | null>(
    null,
  );
  useEffect(() => {
    const read = () =>
      setPreference({
        signal: browserPrivacySignal(),
        optedOut: metricsOptedOut(),
      });
    read();
    window.addEventListener(METRICS_PREFERENCE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(METRICS_PREFERENCE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return preference;
}
