CREATE TABLE public.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_limit_events TO service_role;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_limit_events_lookup ON public.rate_limit_events (bucket, subject, created_at);
COMMENT ON TABLE public.rate_limit_events IS 'Server-only throttle log. Subjects are SHA-256 hashes, never raw IPs or emails.';

CREATE OR REPLACE FUNCTION public.consume_rate_limit(_bucket text, _subject text, _limit integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE used integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_bucket || ':' || _subject, 0));
  DELETE FROM public.rate_limit_events WHERE bucket = _bucket AND subject = _subject AND created_at < now() - make_interval(secs => _window_seconds);
  SELECT count(*) INTO used FROM public.rate_limit_events WHERE bucket = _bucket AND subject = _subject AND created_at >= now() - make_interval(secs => _window_seconds);
  IF used >= _limit THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_events(bucket, subject) VALUES (_bucket, _subject);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) TO service_role;