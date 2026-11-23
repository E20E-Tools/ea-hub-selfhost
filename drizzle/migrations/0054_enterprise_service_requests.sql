ALTER TABLE public.suggestion_requests
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.suggestion_requests DROP CONSTRAINT IF EXISTS suggestion_requests_type_check;
ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_type_check
  CHECK (request_type IN ('new','feature','support','general','service'));
ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_details_object
  CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) < 8192);