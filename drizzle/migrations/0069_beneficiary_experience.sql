ALTER TABLE public.products
  ADD COLUMN beneficiary_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products
  ADD CONSTRAINT products_beneficiary_details_object CHECK (jsonb_typeof(beneficiary_details) = 'object');
COMMENT ON COLUMN public.products.beneficiary_details IS 'Optional bilingual beneficiary fit, discovery and educational metadata; empty means not provided.';

CREATE TABLE public.request_identities (
  request_id uuid PRIMARY KEY REFERENCES public.suggestion_requests(id) ON DELETE CASCADE,
  visitor_id uuid,
  account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_identities_one_owner CHECK (
    (visitor_id IS NOT NULL AND account_id IS NULL)
    OR (visitor_id IS NULL AND account_id IS NOT NULL)
  )
);
GRANT ALL ON public.request_identities TO service_role;
ALTER TABLE public.request_identities ENABLE ROW LEVEL SECURITY;
CREATE INDEX request_identities_visitor_idx ON public.request_identities(visitor_id, created_at DESC) WHERE visitor_id IS NOT NULL;
CREATE INDEX request_identities_account_idx ON public.request_identities(account_id, created_at DESC) WHERE account_id IS NOT NULL;
COMMENT ON TABLE public.request_identities IS 'Service-only ownership links. Visitor IDs come from signed server-minted Archy tokens; account IDs come from verified bearer subjects, never typed email.';

CREATE TABLE public.journey_aggregates (
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Riyadh')::date),
  event text NOT NULL CHECK (event IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating')),
  language text NOT NULL CHECK (language IN ('ar','en')),
  count integer NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 10000000),
  rating_sum integer NOT NULL DEFAULT 0 CHECK (rating_sum BETWEEN 0 AND 50000000),
  PRIMARY KEY (day, event, language)
);
GRANT SELECT ON public.journey_aggregates TO authenticated;
GRANT ALL ON public.journey_aggregates TO service_role;
ALTER TABLE public.journey_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY journey_aggregates_admin_read ON public.journey_aggregates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.journey_event_receipts (
  event_key uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.journey_event_receipts TO service_role;
ALTER TABLE public.journey_event_receipts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.journey_event_receipts IS 'Service-only random or request-specific idempotency keys; no visitor, account, email, URL, fingerprint or free-text data.';

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
  IF _event NOT IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating') THEN RAISE EXCEPTION 'Invalid event'; END IF;
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
REVOKE ALL ON FUNCTION public.record_journey_event(text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_journey_event(text,text,uuid,integer) TO service_role;