alter table public.live_chat_messages add column if not exists reply_ms integer;
create index if not exists archy_latest_visitor on public.live_chat_messages(created_at desc) where reply_source is not null;
create table public.archy_probe (
 engine text primary key check(engine in ('local','remote','saved')), succeeded boolean not null,
 source text, model text, elapsed_ms integer not null, checked_at timestamptz not null default now()
);
create table public.archy_setting_events (
 id uuid primary key default gen_random_uuid(), actor text not null, changes text not null, created_at timestamptz not null default now()
);
create function public.record_archy_changes() returns trigger language plpgsql set search_path=public as $$
declare changes text;
begin
 changes:=concat_ws(' · ',
 case when old.chat_engine is distinct from new.chat_engine then concat('engine ',coalesce(old.chat_engine,'auto'),' → ',coalesce(new.chat_engine,'auto')) end,
 case when old.model is distinct from new.model then concat('model ',old.model,' → ',new.model) end,
 case when old.base_url is distinct from new.base_url then 'provider changed' end,
 case when old.key_changed_at is distinct from new.key_changed_at then case when new.api_key is null then 'key removed' else 'key replaced' end end);
 if changes<>'' then insert into public.archy_setting_events(actor,changes) values(coalesce(new.updated_by,''),changes); end if;
 return new;
end $$;
create trigger archy_settings_audit after insert or update on public.ai_assistant_settings for each row execute function public.record_archy_changes();

create table public.newsletter_members (
 id uuid primary key default gen_random_uuid(), email text not null unique, language text not null check(language in ('ar','en')),
 state text not null default 'pending' check(state in ('pending','active','unsubscribed')),
 token uuid not null default gen_random_uuid() unique, requested_at timestamptz not null default now(), confirmation_sent timestamptz, confirmed_at timestamptz
);
create table public.newsletter_issues (
 month date primary key, body_ar text not null,body_en text not null, created_at timestamptz not null default now()
);
create table public.newsletter_deliveries (
 month date references public.newsletter_issues(month),member_id uuid references public.newsletter_members(id) on delete cascade,
 sent_at timestamptz, primary key(month,member_id)
);
create table public.newsletter_updates (
 id uuid primary key default gen_random_uuid(), title_ar text not null,title_en text not null, path text not null, created_at timestamptz not null default now()
);
do $$ declare tbl text;begin
 foreach tbl in array array['archy_probe','archy_setting_events','newsletter_members','newsletter_issues','newsletter_deliveries','newsletter_updates'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from public,anon,authenticated',tbl);
 execute format('grant all on public.%I to service_role',tbl);
 end loop;
end $$;
set row_security = on;
