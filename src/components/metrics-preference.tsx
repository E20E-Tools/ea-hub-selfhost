import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { setMetricsOptOut } from "@/lib/journey-client";
import { useMetricsPreference } from "@/lib/use-metrics-preference";

/** Visible opt-out for anonymous aggregate event counts. */
export function MetricsPreference() {
  const { t } = useLanguage();
  const preference = useMetricsPreference();
  const [failed, setFailed] = useState(false);
  if (!preference) return null;
  return (
    <div className="bx-metrics-preference">
      {preference.signal ? (
        <p role="status">{t("bxMetricsSignal")}</p>
      ) : (
        <label>
          <input
            type="checkbox"
            checked={!preference.optedOut}
            onChange={(event) => setFailed(!setMetricsOptOut(!event.currentTarget.checked))}
          />
          <span>{t("bxMetricsLabel")}</span>
        </label>
      )}
      <small>{t("bxMetricsHelp")}</small>
      {failed && <small role="alert">{t("bxMetricsSaveFailed")}</small>}
    </div>
  );
}
