CREATE TABLE public.site_visits (
  visitor_key text NOT NULL,
  day date NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_key, day)
);
GRANT ALL ON public.site_visits TO service_role;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX site_visits_day_idx ON public.site_visits (day);