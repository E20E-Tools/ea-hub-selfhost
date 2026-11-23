CREATE TABLE public.contact_settings (
  id boolean PRIMARY KEY DEFAULT true,
  recipient_email text NOT NULL DEFAULT 'ea@e20e.tools',
  notify_enabled boolean NOT NULL DEFAULT true,
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  auto_reply_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT '',
  CONSTRAINT contact_settings_singleton CHECK (id)
);
GRANT SELECT, INSERT, UPDATE ON public.contact_settings TO authenticated;
GRANT ALL ON public.contact_settings TO service_role;
ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read contact settings" ON public.contact_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert contact settings" ON public.contact_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contact settings" ON public.contact_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));