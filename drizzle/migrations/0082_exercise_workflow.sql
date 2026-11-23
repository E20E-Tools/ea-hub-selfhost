ALTER TABLE public.journey_aggregates DROP CONSTRAINT journey_aggregates_event_check;
ALTER TABLE public.journey_aggregates ADD CONSTRAINT journey_aggregates_event_check CHECK (event IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating','contact_started','contact_receipt','service_started','service_receipt','case_viewed','case_opened','exercise_started','exercise_completed','exercise_requested'));
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
  IF _event NOT IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating','contact_started','contact_receipt','service_started','service_receipt','case_viewed','case_opened','exercise_started','exercise_completed','exercise_requested') THEN RAISE EXCEPTION 'Invalid event'; END IF;
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

ALTER TABLE public.suggestion_requests ADD COLUMN pending_question text NOT NULL DEFAULT '';
ALTER TABLE public.request_replies ADD COLUMN needs_reply boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.update_request_next_action() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.needs_reply OR NEW.author_kind='visitor' THEN
 UPDATE public.suggestion_requests SET pending_question=CASE WHEN NEW.needs_reply THEN NEW.body ELSE '' END,
 status_updated_at=now() WHERE id=NEW.request_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER request_next_action AFTER INSERT ON public.request_replies FOR EACH ROW EXECUTE FUNCTION public.update_request_next_action();
UPDATE public.products SET beneficiary_details=jsonb_set(coalesce(beneficiary_details,'{}'::jsonb),'{operations}',
 '{"account":{"ar":"يتطلب فتح لوحة المنتج تسجيل الدخول وصلاحية القسم.","en":"Opening the dashboard requires sign-in and access to the section."},"inputs":{"ar":"","en":""},"exchange":{"ar":"","en":""},"reviewed":"2026-11-19"}'::jsonb) WHERE id='archone' AND NOT(coalesce(beneficiary_details,'{}'::jsonb) ? 'operations');
