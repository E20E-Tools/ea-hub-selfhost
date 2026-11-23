CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role_ar text NOT NULL DEFAULT '' CHECK (char_length(role_ar) <= 160),
  role_en text NOT NULL DEFAULT '' CHECK (char_length(role_en) <= 160),
  organization_ar text NOT NULL DEFAULT '' CHECK (char_length(organization_ar) <= 160),
  organization_en text NOT NULL DEFAULT '' CHECK (char_length(organization_en) <= 160),
  quote_ar text NOT NULL DEFAULT '' CHECK (char_length(quote_ar) <= 1200),
  quote_en text NOT NULL DEFAULT '' CHECK (char_length(quote_en) <= 1200),
  image_url text NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 400),
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(quote_ar) > 0 OR char_length(quote_en) > 0)
);
GRANT SELECT ON public.testimonials TO anon, authenticated;
GRANT ALL ON public.testimonials TO service_role;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published testimonials" ON public.testimonials
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "Admins can view all testimonials" ON public.testimonials
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));