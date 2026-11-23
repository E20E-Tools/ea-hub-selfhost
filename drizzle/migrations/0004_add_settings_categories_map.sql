alter table public.site_settings add column categories jsonb not null default '{}'::jsonb;

comment on column public.site_settings.categories is 'Map of category id to its display name shown in the library filter bar.';