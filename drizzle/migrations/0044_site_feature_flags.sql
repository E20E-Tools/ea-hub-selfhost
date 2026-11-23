ALTER TABLE public.site_settings
  ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{"assistant":true,"recommendations":true,"support":true,"affiliates":true,"roadmap":true,"blog":true}'::jsonb;