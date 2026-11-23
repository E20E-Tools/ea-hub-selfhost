ALTER POLICY "admins manage products" ON public.products
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "admins manage settings" ON public.site_settings
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "Admins read activity" ON public.admin_activity
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');