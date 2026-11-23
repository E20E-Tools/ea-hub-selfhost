ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS motion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motion_speed numeric NOT NULL DEFAULT 1 CHECK (motion_speed >= 0.25 AND motion_speed <= 3),
  ADD COLUMN IF NOT EXISTS motion_direction text NOT NULL DEFAULT 'normal' CHECK (motion_direction IN ('normal','reverse','alternate'));