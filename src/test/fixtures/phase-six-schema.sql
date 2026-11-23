-- Synthetic schema only. This file MUST only be applied to a disposable local database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.role',true) $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('fixture.jwt',true),''),'{}')::jsonb $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.site_settings(id boolean PRIMARY KEY, display_title text, feature_flags jsonb, archy_greeting jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE public.ai_assistant_settings(id boolean PRIMARY KEY,base_url text,model text,speed text,api_key text,updated_by text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.contact_settings(id boolean PRIMARY KEY,recipient_email text,notify_enabled boolean,auto_reply_enabled boolean,auto_reply_text text,updated_by text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.live_chats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,last_message_at timestamptz);
CREATE TABLE public.live_chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),chat_id uuid REFERENCES public.live_chats(id) ON DELETE CASCADE,body text);
CREATE TABLE public.live_chat_ratings(chat_id uuid PRIMARY KEY REFERENCES public.live_chats(id) ON DELETE CASCADE,stars integer);
CREATE TABLE public.suggestion_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),details jsonb,status text);
CREATE TABLE public.site_visits(visitor_key text,day date,first_seen_at timestamptz,PRIMARY KEY(visitor_key,day));
CREATE TABLE public.admin_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,actor_email text NOT NULL,action text NOT NULL CHECK(length(action)<=60),target text NOT NULL CHECK(length(target)<=200),created_at timestamptz DEFAULT now());