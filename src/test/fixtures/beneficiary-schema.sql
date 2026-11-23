-- Synthetic schema for a disposable local PostgreSQL cluster only.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.role',true) $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.products(id text PRIMARY KEY);
CREATE TABLE public.suggestion_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), need text NOT NULL DEFAULT 'synthetic');
