-- EA-Hub self-host: runs after drizzle/migrations on every start (idempotent).

-- Storage buckets used by the app (on Supabase they were created in the dashboard).
insert into storage.buckets (id, name, public) values
  ('library-assets', 'library-assets', false),
  ('request-attachments', 'request-attachments', false)
on conflict (id) do nothing;

-- Realtime: announce row changes of every table in the supabase_realtime publication.
create schema if not exists selfhost;
revoke all on schema selfhost from public;

create or replace function selfhost.notify_change() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  perform pg_notify(
    'ea_hub_realtime',
    json_build_object('schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op, 'id', rec ->> 'id')::text
  );
  return null;
end
$$;

do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('drop trigger if exists selfhost_realtime on %I.%I', r.schemaname, r.tablename);
    execute format(
      'create trigger selfhost_realtime after insert or update or delete on %I.%I for each row execute function selfhost.notify_change()',
      r.schemaname, r.tablename);
  end loop;
end
$$;

-- Single-row settings tables (primary key `id boolean = true`). Supabase production already
-- had these rows; a fresh install needs them so admin "save" updates have a row to change.
-- Tables whose columns have no defaults are left for the app to create.
do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.table_constraints tc
      on tc.table_schema = c.table_schema and tc.table_name = c.table_name and tc.constraint_type = 'PRIMARY KEY'
    join information_schema.key_column_usage k
      on k.constraint_name = tc.constraint_name and k.table_schema = c.table_schema and k.column_name = c.column_name
    where c.table_schema = 'public' and c.column_name = 'id' and c.data_type = 'boolean'
  loop
    begin
      execute format('insert into public.%I (id) values (true) on conflict do nothing', r.table_name);
    exception when not_null_violation or check_violation then
      null;
    end;
  end loop;
end
$$;
