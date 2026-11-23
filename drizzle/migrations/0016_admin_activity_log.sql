CREATE TABLE public.admin_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (char_length(action) <= 60),
  target text NOT NULL DEFAULT '' CHECK (char_length(target) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_activity TO authenticated;
GRANT ALL ON public.admin_activity TO service_role;
ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read activity" ON public.admin_activity FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX admin_activity_created_idx ON public.admin_activity (created_at DESC);
COMMENT ON TABLE public.admin_activity IS 'Append-only admin audit log; written by server functions with service role only.';