ALTER TABLE public.suggestion_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS impact text NOT NULL DEFAULT '';

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.suggestion_requests'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE public.suggestion_requests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

UPDATE public.suggestion_requests SET status = CASE status WHEN 'pending' THEN 'new' WHEN 'confirmed' THEN 'in_progress' ELSE status END;
ALTER TABLE public.suggestion_requests ALTER COLUMN status SET DEFAULT 'new';

INSERT INTO public.suggestion_requests (id, name, email, company, phone, need, created_at, request_type, status)
SELECT id, name, email, company, coalesce(phone, ''), message, created_at, 'general', 'new' FROM public.contact_messages
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_status_check CHECK (status IN ('new','in_progress','resolved','rejected'));
ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_type_check CHECK (request_type IN ('new','feature','support','general'));
ALTER TABLE public.suggestion_requests ADD CONSTRAINT suggestion_requests_urgency_check CHECK (urgency IS NULL OR urgency IN ('low','normal','urgent'));
CREATE INDEX IF NOT EXISTS suggestion_requests_type_created_idx ON public.suggestion_requests (request_type, created_at DESC);

COMMENT ON TABLE public.contact_messages IS 'DEPRECATED: merged into suggestion_requests (request_type = general)';

CREATE TABLE public.support_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_type text NOT NULL CHECK (offer_type IN ('partnership','financial','contribution')),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','accepted','declined')),
  status_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_offers TO service_role;
ALTER TABLE public.support_offers ENABLE ROW LEVEL SECURITY;
CREATE INDEX support_offers_created_idx ON public.support_offers (created_at DESC);
CREATE INDEX support_offers_email_created_idx ON public.support_offers (email, created_at DESC);