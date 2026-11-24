-- Cairo becomes the site font for headings and body text (bundled with the app).
-- The admin can still pick another font in Appearance; this resets the saved choice once.
alter table public.site_settings alter column heading_font set default 'Cairo';
alter table public.site_settings alter column body_font set default 'Cairo';
update public.site_settings set heading_font = 'Cairo', body_font = 'Cairo'
  where heading_font <> 'Cairo' or body_font <> 'Cairo';
