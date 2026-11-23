create policy "library assets are readable for signed links"
on storage.objects for select to anon, authenticated
using (bucket_id = 'library-assets');

create policy "admins upload library assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'library-assets' and public.has_role(auth.uid(), 'admin'));

create policy "admins replace library assets"
on storage.objects for update to authenticated
using (bucket_id = 'library-assets' and public.has_role(auth.uid(), 'admin'));

create policy "admins remove library assets"
on storage.objects for delete to authenticated
using (bucket_id = 'library-assets' and public.has_role(auth.uid(), 'admin'));