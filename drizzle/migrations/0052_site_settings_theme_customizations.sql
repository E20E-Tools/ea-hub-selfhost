ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS theme_customizations jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_theme_customizations_object
  CHECK (jsonb_typeof(theme_customizations) = 'object' AND pg_column_size(theme_customizations) < 65536);

GRANT SELECT (theme_customizations) ON public.site_settings TO anon, authenticated;
GRANT UPDATE (theme_customizations) ON public.site_settings TO authenticated;

COMMENT ON COLUMN public.site_settings.theme_customizations IS
  'Per-design overrides keyed by design id: colours, sizes, logo, background and product pictures (storage paths).';