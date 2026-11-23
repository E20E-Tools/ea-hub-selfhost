create table if not exists public.archy_work_policy (
  id boolean primary key default true check (id), policy jsonb not null
);
create table if not exists public.newsletter_editorial (
  month date primary key, body_ar text, body_en text
);
alter table public.archy_work_policy enable row level security;
alter table public.newsletter_editorial enable row level security;
revoke all on public.archy_work_policy, public.newsletter_editorial from public, anon, authenticated;
grant select, insert, update on public.archy_work_policy to service_role;
