ALTER POLICY "admins read request attachments" ON storage.objects
  USING (bucket_id = 'request-attachments' AND public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "admins read library assets" ON storage.objects
  USING (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "admins remove library assets" ON storage.objects
  USING (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "admins replace library assets" ON storage.objects
  USING (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
ALTER POLICY "admins upload library assets" ON storage.objects
  WITH CHECK (bucket_id = 'library-assets' AND public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');