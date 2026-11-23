drop policy if exists "library assets are readable for signed links" on storage.objects;
create policy "admins read library assets"
on storage.objects for select to authenticated
using (bucket_id = 'library-assets' and public.has_role(auth.uid(), 'admin'));