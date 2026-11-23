-- Admin roles
create type public.app_role as enum ('admin');

create table public.user_roles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create or replace function public.has_admin_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;

GRANT EXECUTE ON FUNCTION public.has_admin_owner() TO anon, authenticated;

-- Allowlist of emails that may become admins (read only by privileged code)
create table public.admin_emails(
  email text primary key,
  created_at timestamptz not null default now()
);

GRANT ALL ON public.admin_emails TO service_role;
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- The first account becomes the owner; later accounts need an allowlisted email
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
      on conflict (user_id, role) do nothing;
  elsif exists (select 1 from public.admin_emails where lower(email) = lower(new.email)) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
      on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Products catalogue
create table public.products(
  id text primary key,
  name text not null,
  category text not null default 'architecture',
  label text not null default '',
  description text not null default '',
  overview text not null default '',
  features text[] not null default '{}',
  pricing jsonb not null default '[]'::jsonb,
  url text not null default '',
  keywords text not null default '',
  coming_soon boolean not null default false,
  image_url text not null default '',
  image_alt text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

create policy "products are readable by everyone"
on public.products for select to anon, authenticated using (true);

create policy "admins manage products"
on public.products for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Site identity, fonts and theme (single row)
create table public.site_settings(
  id boolean primary key default true,
  display_title text not null default 'E20E Tools.',
  arabic_title text not null default 'كل أدواتك، في مكان واحد.',
  description text not null default 'منتجات متخصصة في البنية المؤسسية وإدارة التقنيات. اختر الأداة المناسبة لاحتياجك.',
  logo_url text not null default '',
  heading_font text not null default 'Alexandria',
  body_font text not null default 'Alexandria',
  colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

create policy "settings are readable by everyone"
on public.site_settings for select to anon, authenticated using (true);

create policy "admins manage settings"
on public.site_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));