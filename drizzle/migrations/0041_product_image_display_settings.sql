ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS image_fit text NOT NULL DEFAULT 'contain',
  ADD COLUMN IF NOT EXISTS image_brightness numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS image_contrast numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS image_saturation numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS image_sharpen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobile_nav_style text NOT NULL DEFAULT 'sheet';