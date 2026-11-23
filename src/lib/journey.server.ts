import type { JourneyEvent } from "./journey.shared";

/** Aggregate-only write; the event key prevents retry/render duplicates. */
export async function recordJourney(
  event: JourneyEvent,
  language: "ar" | "en",
  eventKey: string,
  rating?: number,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("record_journey_event", {
      _event: event,
      _language: language,
      _event_key: eventKey,
      ...(rating === undefined ? {} : { _rating: rating }),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
