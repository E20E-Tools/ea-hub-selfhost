ALTER TABLE public.suggestion_requests ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.suggestion_requests ADD COLUMN status_updated_at timestamptz;
ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_status_check CHECK (status IN ('pending','confirmed','rejected'));