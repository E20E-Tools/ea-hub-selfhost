ALTER TABLE public.products ADD COLUMN IF NOT EXISTS label_en text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS overview_en text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS features_en text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pricing_en jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_alt_en text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whats_new_en text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.products.description_en IS 'English visitor copy for the short description. An empty value falls back to description.';
COMMENT ON COLUMN public.products.overview_en IS 'English visitor copy for the product overview. An empty value falls back to overview.';
COMMENT ON COLUMN public.products.features_en IS 'English feature bullets shown on the visitor product page. An empty array falls back to features.';
COMMENT ON COLUMN public.products.pricing_en IS 'English pricing tiers shown to visitors. An empty array falls back to pricing.';
COMMENT ON COLUMN public.products.label_en IS 'English category label shown on library cards.';
COMMENT ON COLUMN public.products.image_alt_en IS 'English alternative text for the product illustration.';
COMMENT ON COLUMN public.products.whats_new_en IS 'English release note for the current version.';

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS categories_en jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.site_settings.description_en IS 'English organisation description shown in the site header and request page. An empty value falls back to description.';
COMMENT ON COLUMN public.site_settings.categories_en IS 'Map of category id to its English display name.';