CREATE TABLE public.assistant_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_email TEXT NOT NULL,
  visitor_name TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.assistant_replies TO service_role;

ALTER TABLE public.assistant_replies ENABLE ROW LEVEL SECURITY;

CREATE INDEX assistant_replies_created_at_idx ON public.assistant_replies (created_at DESC);

COMMENT ON TABLE public.assistant_replies IS 'Assistant replies only (no visitor prompts); read by admins via server function.';