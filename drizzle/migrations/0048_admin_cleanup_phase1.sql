-- Single public email: keep site_settings.contact_info.email, fill from contact_settings.public_email when empty.
UPDATE public.site_settings s
SET contact_info = jsonb_set(COALESCE(s.contact_info, '{}'::jsonb), '{email}', to_jsonb(c.public_email))
FROM public.contact_settings c
WHERE s.id = true AND c.id = true
  AND COALESCE(NULLIF(btrim(s.contact_info->>'email'), ''), '') = ''
  AND COALESCE(btrim(c.public_email), '') <> '';

ALTER TABLE public.contact_settings DROP COLUMN IF EXISTS public_email;
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS feature_details;

DROP POLICY IF EXISTS "Verified admins add completion" ON public.feature_task_completion;
DROP POLICY IF EXISTS "Verified admins read completion" ON public.feature_task_completion;
DROP POLICY IF EXISTS "Verified admins update completion" ON public.feature_task_completion;
DROP TABLE IF EXISTS public.feature_task_completion;
DROP FUNCTION IF EXISTS public.stamp_feature_completion();

DROP FUNCTION IF EXISTS public.admin_contact_add(uuid, text);
DROP FUNCTION IF EXISTS public.admin_contact_remove(uuid, text);
DROP TABLE IF EXISTS public.admin_emails;

DROP TABLE IF EXISTS public.email_server_settings;