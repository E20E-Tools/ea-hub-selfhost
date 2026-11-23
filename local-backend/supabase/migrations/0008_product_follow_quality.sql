alter table public.archy_cases add column expected text not null default '';
update public.archy_cases set expected='Tech Radar'||chr(10)||'/product/radar#capabilities' where question in ('كيف أقيّم تقنية جديدة قبل اعتمادها؟','Which tool can help us assess an emerging technology?');
alter table public.newsletter_members add column general boolean not null default true, add column products text[] not null default '{}',add column preferences_sent timestamptz;
alter table public.newsletter_issues add column entries jsonb not null default '[]';
create table public.newsletter_launch_alerts(member_id uuid references public.newsletter_members(id) on delete cascade,product_id text not null references public.products(id) on delete cascade,sent_at timestamptz,primary key(member_id,product_id));
alter table public.newsletter_launch_alerts enable row level security;
revoke all on public.newsletter_launch_alerts from public,anon,authenticated;
grant all on public.newsletter_launch_alerts to service_role;
