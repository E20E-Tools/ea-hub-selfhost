CREATE TABLE public.assistant_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.assistant_registrations TO service_role;
ALTER TABLE public.assistant_registrations ENABLE ROW LEVEL SECURITY;