CREATE TABLE public.request_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.suggestion_requests(id) ON DELETE CASCADE,
  author_email text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.request_replies TO service_role;
ALTER TABLE public.request_replies ENABLE ROW LEVEL SECURITY;
CREATE INDEX request_replies_request_idx ON public.request_replies (request_id, created_at);