alter table public.ai_assistant_settings
  add column if not exists registration_limit integer not null default 5 check (registration_limit between 1 and 100),
  add column if not exists registration_wait_minutes integer not null default 60 check (registration_wait_minutes between 1 and 1440);

-- One transaction consumes a registration and stores it, or returns the retry time in milliseconds.
create or replace function public.register_archy_guest(_subject text, _name text, _email text, _question text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  quota integer;
  period interval;
  last_block timestamptz;
  used integer;
  stamp timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('archy-register:' || _subject, 0));
  stamp := clock_timestamp();
  select registration_limit, make_interval(mins => registration_wait_minutes)
    into quota, period from public.ai_assistant_settings where id;
  quota := coalesce(quota, 5);
  period := coalesce(period, interval '60 minutes');
  select max(created_at) into last_block from public.rate_limit_events
    where bucket='archy-register:cooldown' and subject=_subject;
  if last_block + period > stamp then
    return ceil(extract(epoch from last_block + period)*1000)::bigint;
  end if;
  select count(*) into used from public.rate_limit_events where bucket='archy-register:guest'
    and subject=_subject and created_at > stamp-period and (last_block is null or created_at > last_block);
  if used < quota then
    insert into public.assistant_registrations(name,email,question) values(_name,_email,_question);
    insert into public.rate_limit_events(bucket,subject,created_at) values('archy-register:guest',_subject,stamp);
  end if;
  if used+1 >= quota then
    insert into public.rate_limit_events(bucket,subject,created_at) values('archy-register:cooldown',_subject,stamp);
  end if;
  if used >= quota then return ceil(extract(epoch from stamp+period)*1000)::bigint; end if;
  return 0;
end;
$$;
revoke all on function public.register_archy_guest(text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_archy_guest(text,text,text,text) to service_role;
