import { useState } from "react";
import { Star } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { trackJourney } from "@/lib/journey-client";
import { MetricsPreference } from "@/components/metrics-preference";
import { useMetricsPreference } from "@/lib/use-metrics-preference";

export function JourneyRating() {
  const { t, language } = useLanguage();
  const [rated, setRated] = useState(false);
  const [busy, setBusy] = useState(false);
  const preference = useMetricsPreference();
  // Ratings are aggregate metrics too: hide them when the visitor or browser opted out.
  if (!preference || preference.signal || preference.optedOut)
    return <MetricsPreference />;
  if (rated)
    return (
      <p className="bx-rating" role="status">
        {t("bxRateThanks")}
      </p>
    );
  return (
    <fieldset className="bx-rating" disabled={busy}>
      <legend>{t("bxRateJourney")}</legend>
      <div role="group" aria-label={t("bxRateLabel")}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className="bx-rating-star"
            aria-label={`${rating} / 5`}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void trackJourney("journey_rating", language, {
                rating,
                oncePerSession: true,
              }).then((ok) => {
                if (ok) setRated(true);
                setBusy(false);
              });
            }}
          >
            <Star aria-hidden="true" />
            <span className="sr-only">{rating}</span>
          </button>
        ))}
      </div>
      <MetricsPreference />
    </fieldset>
  );
}
