ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT 'EA Tools Build by EA to EA.',
  ADD COLUMN IF NOT EXISTS tagline_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nav_style text NOT NULL DEFAULT 'glass';