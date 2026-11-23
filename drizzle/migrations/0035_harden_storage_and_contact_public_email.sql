ALTER POLICY "admins replace library assets" ON storage.objects
  USING (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.contact_settings ADD COLUMN IF NOT EXISTS public_email text NOT NULL DEFAULT 'ea@e20e.tools';
COMMENT ON COLUMN public.ai_assistant_settings.api_key IS 'Encrypted at rest (enc:v1 AES-GCM, server-only key). Never store plain text.';
COMMENT ON COLUMN public.email_server_settings.smtp_password IS 'Encrypted at rest (enc:v1 AES-GCM, server-only key). Never store plain text.';