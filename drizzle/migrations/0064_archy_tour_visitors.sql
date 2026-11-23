CREATE TABLE public.archy_tour_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 visitor_key text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 chat_opened_at timestamptz,
 visitor_id uuid,
 visitor_name text NOT NULL DEFAULT '',
 visitor_email text NOT NULL DEFAULT '',
 support_request_id uuid REFERENCES public.suggestion_requests(id) ON DELETE SET NULL,
 support_submitted_at timestamptz
);
GRANT SELECT ON public.archy_tour_visits TO authenticated;
GRANT ALL ON public.archy_tour_visits TO service_role;
ALTER TABLE public.archy_tour_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read Archy tour visits" ON public.archy_tour_visits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX archy_tour_visits_started_idx ON public.archy_tour_visits (started_at DESC);