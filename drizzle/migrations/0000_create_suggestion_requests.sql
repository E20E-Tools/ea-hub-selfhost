CREATE TABLE public.suggestion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  need TEXT NOT NULL,
  recommendation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.suggestion_requests TO anon;
GRANT ALL ON public.suggestion_requests TO service_role;

ALTER TABLE public.suggestion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a suggestion request"
ON public.suggestion_requests
FOR INSERT
TO anon
WITH CHECK (true);