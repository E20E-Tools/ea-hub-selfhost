ALTER TABLE public.journey_aggregates DROP CONSTRAINT journey_aggregates_event_check;
ALTER TABLE public.journey_aggregates ADD CONSTRAINT journey_aggregates_event_check CHECK (event IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating','contact_started','contact_receipt','service_started','service_receipt'));
CREATE OR REPLACE FUNCTION public.record_journey_event(
  _event text,
  _language text,
  _event_key uuid,
  _rating integer DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _event NOT IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating','contact_started','contact_receipt','service_started','service_receipt') THEN RAISE EXCEPTION 'Invalid event'; END IF;
  IF _language NOT IN ('ar','en') THEN RAISE EXCEPTION 'Invalid language'; END IF;
  IF (_event = 'journey_rating') IS DISTINCT FROM (_rating IS NOT NULL) THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  IF _rating IS NOT NULL AND _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  INSERT INTO public.journey_event_receipts(event_key) VALUES (_event_key)
    ON CONFLICT(event_key) DO NOTHING RETURNING event_key INTO inserted;
  IF inserted IS NULL THEN RETURN false; END IF;
  INSERT INTO public.journey_aggregates(day,event,language,count,rating_sum)
  VALUES ((now() AT TIME ZONE 'Asia/Riyadh')::date,_event,_language,1,coalesce(_rating,0))
  ON CONFLICT(day,event,language) DO UPDATE SET
    count = LEAST(public.journey_aggregates.count + 1, 10000000),
    rating_sum = LEAST(public.journey_aggregates.rating_sum + coalesce(_rating,0), 50000000);
  RETURN true;
END $$;
