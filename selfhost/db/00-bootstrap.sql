-- EA-Hub self-host: the small part of the Supabase platform that the upstream migrations
-- expect to exist, recreated on a plain PostgreSQL server (16+).
--
-- Runs as the database owner (superuser) before `drizzle/migrations`, on every start.
-- Everything here is idempotent. Nothing in this file is Supabase software: it is plain SQL
-- that provides the same names (roles anon/authenticated/service_role, schema auth with
-- auth.uid()/auth.role()/auth.jwt(), schema storage, publication supabase_realtime) so the
-- upstream migrations, RLS policies and SECURITY DEFINER functions keep working unchanged.

-- ---------- roles (same names and semantics as PostgREST/Supabase) ----------
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Supabase's API roles get a statement timeout; keep the same guard rails here.
alter role anon set statement_timeout = '8s';
alter role authenticated set statement_timeout = '8s';

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Supabase grants every API role full table privileges by default and lets RLS decide.
-- The upstream migrations rely on that and then revoke where needed.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- ---------- auth ----------
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text default 'authenticated',
  role text default 'authenticated',
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  recovery_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phone text,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);
create unique index if not exists users_email_lower_key on auth.users (lower(email));

-- Refresh tokens and one-time tokens (password recovery) are stored hashed only.
create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists refresh_tokens_session_idx on auth.refresh_tokens (session_id);
create index if not exists refresh_tokens_user_idx on auth.refresh_tokens (user_id);

create table if not exists auth.one_time_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Same definitions PostgREST-based Supabase uses: claims come from the per-transaction
-- setting `request.jwt.claims`, set by the app's database adapter.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- ---------- storage (files live on disk; this is the metadata that RLS policies check) ----------
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create or replace function storage.filename(name text) returns text
language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
create or replace function storage.extension(name text) returns text
language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;

-- ---------- realtime ----------
-- Upstream migrations add tables to this publication. The self-hosted app does not use
-- logical replication; post-migrate.sql attaches a NOTIFY trigger to every table listed here.
do $$
begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
