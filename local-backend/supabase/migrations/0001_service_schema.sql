CREATE PUBLICATION supabase_realtime;
--
-- PostgreSQL database dump
--



-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.7 (Debian 18.7-1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin'
);


--
-- Name: capture_settings_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capture_settings_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE sections text[]; section_name text; before_value jsonb; after_value jsonb; actor uuid; label text; BEGIN actor=auth.uid(); label=coalesce(auth.jwt()->>'email',to_jsonb(NEW)->>'updated_by',''); sections=CASE TG_TABLE_NAME WHEN 'site_settings' THEN ARRAY['general','appearance','navigation','features','contact_info','categories','customize','terms','archy'] WHEN 'ai_assistant_settings' THEN ARRAY['ai'] ELSE ARRAY['notifications'] END; FOREACH section_name IN ARRAY sections LOOP before_value=public.settings_section_value(TG_TABLE_NAME,section_name,CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END); after_value=public.settings_section_value(TG_TABLE_NAME,section_name,to_jsonb(NEW)); IF before_value IS DISTINCT FROM after_value THEN INSERT INTO public.settings_versions(section,source,actor_id,actor_label,previous_value,new_value) VALUES(section_name,TG_TABLE_NAME,actor,label,before_value,after_value); END IF; END LOOP; RETURN NEW; END $$;


--
-- Name: cleanup_retention_batch(text, text[], integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_retention_batch(_type text, _ids text[], _expected_revision integer, _actor uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE days_value integer; enabled boolean; rev integer; removed integer; ids text[]; BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF; IF cardinality(_ids)>100 OR cardinality(_ids)<1 THEN RAISE EXCEPTION 'Invalid batch'; END IF; SELECT p.days,p.manual_enabled,p.revision INTO days_value,enabled,rev FROM public.retention_policies p WHERE p.data_type=_type FOR UPDATE; IF NOT FOUND OR NOT enabled OR rev IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'retentionConflict'; END IF; LOCK TABLE public.suggestion_requests IN SHARE ROW EXCLUSIVE MODE; LOCK TABLE public.live_chats IN SHARE ROW EXCLUSIVE MODE; SELECT array_agg(candidate_id) INTO ids FROM public.retention_candidates(_type,days_value,100) WHERE candidate_id=ANY(_ids); IF _type='chats' THEN DELETE FROM public.live_chats WHERE id::text=ANY(ids); ELSIF _type='visits' THEN DELETE FROM public.site_visits WHERE visitor_key||'|'||day::text=ANY(ids); ELSIF _type='telemetry' THEN DELETE FROM public.application_telemetry WHERE id::text=ANY(ids); ELSE RAISE EXCEPTION 'Unsupported type'; END IF; GET DIAGNOSTICS removed=ROW_COUNT; INSERT INTO public.admin_activity(actor_id,actor_email,action,target) VALUES(_actor,'','retention.cleanup',_type||' count='||removed::text); RETURN removed; END $$;


--
-- Name: consume_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_rate_limit(_bucket text, _subject text, _limit integer, _window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE used integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_bucket || ':' || _subject, 0));
  DELETE FROM public.rate_limit_events WHERE bucket = _bucket AND subject = _subject AND created_at < now() - make_interval(secs => _window_seconds);
  SELECT count(*) INTO used FROM public.rate_limit_events WHERE bucket = _bucket AND subject = _subject AND created_at >= now() - make_interval(secs => _window_seconds);
  IF used >= _limit THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_events(bucket, subject) VALUES (_bucket, _subject);
  RETURN true;
END;
$$;


--
-- Name: has_admin_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_admin_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select (_user_id = auth.uid() or auth.role() = 'service_role')
    and exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;


--
-- Name: purge_expired_chats_bounded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_chats_bounded() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE ids text[]; removed integer; days_value integer; BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF; SELECT p.days INTO days_value FROM public.retention_policies p WHERE p.data_type='chats'; days_value := COALESCE(days_value, 90); LOCK TABLE public.suggestion_requests IN SHARE ROW EXCLUSIVE MODE; LOCK TABLE public.live_chats IN SHARE ROW EXCLUSIVE MODE; SELECT array_agg(candidate_id) INTO ids FROM public.retention_candidates('chats',days_value,100); DELETE FROM public.live_chats WHERE id::text=ANY(ids); GET DIAGNOSTICS removed=ROW_COUNT; IF removed>0 THEN INSERT INTO public.admin_activity(actor_id,actor_email,action,target) VALUES('00000000-0000-0000-0000-000000000000','system','retention.chat_expiry','chats count='||removed::text); END IF; RETURN removed; END $$;


--
-- Name: record_journey_event(text, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_journey_event(_event text, _language text, _event_key uuid, _rating integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE inserted uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _event NOT IN ('chooser_started','chooser_completed','comparison_opened','comparison_tool_opened','demo_completed','request_completed','journey_rating') THEN RAISE EXCEPTION 'Invalid event'; END IF;
  IF _language NOT IN ('ar','en') THEN RAISE EXCEPTION 'Invalid language'; END IF;
  IF (_event = 'journey_rating') IS DISTINCT FROM (_rating IS NOT NULL) THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  IF _rating IS NOT NULL AND _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  INSERT INTO public.journey_event_receipts(event_key) VALUES (_event_key)
    ON CONFLICT(event_key) DO NOTHING RETURNING event_key INTO inserted;
  IF inserted IS NULL THEN RETURN false; END IF;
  INSERT INTO public.journey_aggregates(day,event,language,count,rating_sum)
  VALUES ((now() AT TIME ZONE 'Asia/Riyadh')::date,_event,_language,1,coalesce(_rating,0))
  ON CONFLICT(day,event,language) DO UPDATE SET
    count = LEAST(public.journey_aggregates.count + 1, 10000000),
    rating_sum = LEAST(public.journey_aggregates.rating_sum + coalesce(_rating,0), 50000000);
  RETURN true;
END $$;


--
-- Name: restore_settings_version(uuid, jsonb, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_settings_version(_version uuid, _expected jsonb, _value jsonb, _actor uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$ DECLARE h public.settings_versions; current_row jsonb; current_value jsonb; restored uuid; BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF; SELECT * INTO h FROM public.settings_versions WHERE id=_version; IF NOT FOUND OR h.source NOT IN ('site_settings','ai_assistant_settings','contact_settings') THEN RAISE EXCEPTION 'Missing version'; END IF; EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE id=true FOR UPDATE',h.source) INTO current_row; current_value=public.settings_section_value(h.source,h.section,current_row); IF current_value IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'settingsConflict'; END IF; IF public.settings_section_value(h.source,h.section,_value) IS DISTINCT FROM _value OR _value IS DISTINCT FROM h.previous_value THEN RAISE EXCEPTION 'Invalid restore'; END IF; IF _value='{}'::jsonb THEN RAISE EXCEPTION 'No previous value'; END IF; IF h.section='ai' THEN IF current_row->>'api_key' IS NOT NULL AND split_part(current_row->>'base_url','/',3) IS DISTINCT FROM split_part(_value->>'base_url','/',3) THEN RAISE EXCEPTION 'errAiKeyOrigin'; END IF; END IF; IF current_value=_value THEN INSERT INTO public.settings_versions(section,source,actor_id,actor_label,previous_value,new_value,restored_from) VALUES(h.section,h.source,_actor,'',current_value,_value,_version) RETURNING id INTO restored; ELSE EXECUTE format('UPDATE public.%I SET %s, updated_at=now() WHERE id=true',h.source,(SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',key,h.source,key),',') FROM jsonb_object_keys(_value) AS key)) USING _value; SELECT id INTO restored FROM public.settings_versions WHERE source=h.source AND section=h.section ORDER BY created_at DESC,id DESC LIMIT 1; UPDATE public.settings_versions SET actor_id=_actor,actor_label='',restored_from=_version WHERE id=restored; END IF; INSERT INTO public.admin_activity(actor_id,actor_email,action,target) VALUES(_actor,'','settings.restore',h.section); RETURN restored; END $_$;


--
-- Name: FUNCTION restore_settings_version(_version uuid, _expected jsonb, _value jsonb, _actor uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_settings_version(_version uuid, _expected jsonb, _value jsonb, _actor uuid) IS 'Verified admin server only; row-lock compare-and-swap; does not restore or move credentials; every restore creates audit history.';


--
-- Name: retention_candidates(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retention_candidates(_type text, _days integer, _limit integer) RETURNS TABLE(candidate_id text, eligible_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF; IF _days<30 OR _days>730 OR _limit<1 OR _limit>101 THEN RAISE EXCEPTION 'Invalid bounds'; END IF; IF _type='chats' THEN RETURN QUERY SELECT c.id::text,c.last_message_at FROM public.live_chats c WHERE c.last_message_at<now()-make_interval(days=>_days) AND c.status NOT IN ('waiting','active') AND NOT EXISTS(SELECT 1 FROM public.suggestion_requests r WHERE r.details->>'chatId'=c.id::text AND r.status IN ('new','in_progress')) ORDER BY c.last_message_at,c.id LIMIT _limit; ELSIF _type='visits' THEN RETURN QUERY SELECT v.visitor_key||'|'||v.day::text,v.first_seen_at FROM public.site_visits v WHERE v.first_seen_at<now()-make_interval(days=>_days) ORDER BY v.first_seen_at,v.visitor_key LIMIT _limit; ELSIF _type='telemetry' THEN RETURN QUERY SELECT t.id::text,t.created_at FROM public.application_telemetry t WHERE t.created_at<now()-make_interval(days=>_days) ORDER BY t.created_at,t.id LIMIT _limit; ELSE RAISE EXCEPTION 'Unsupported type'; END IF; END $$;


--
-- Name: retention_policy_validation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retention_policy_validation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN IF NEW.data_type='chats' AND NEW.days<>90 THEN RAISE EXCEPTION 'Chats retain the 90 day policy'; END IF; RETURN NEW; END $$;


--
-- Name: run_daily_maintenance(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_daily_maintenance(_batch integer DEFAULT 5000) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rate_removed integer := 0;
  visits_removed integer := 0;
  telemetry_removed integer := 0;
  chats_removed integer := 0;
  step integer;
  i integer;
  visit_days integer;
  telemetry_days integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _batch < 1 OR _batch > 10000 THEN RAISE EXCEPTION 'Invalid bounds'; END IF;

  -- Rate-limit history: every window is at most one day, so 7 days is always safe.
  DELETE FROM public.rate_limit_events
  WHERE id IN (
    SELECT id FROM public.rate_limit_events
    WHERE created_at < now() - interval '7 days'
    ORDER BY id
    LIMIT _batch
  );
  GET DIAGNOSTICS rate_removed = ROW_COUNT;

  SELECT p.days INTO visit_days FROM public.retention_policies p WHERE p.data_type = 'visits';
  visit_days := COALESCE(visit_days, 90);
  DELETE FROM public.site_visits
  WHERE ctid IN (
    SELECT ctid FROM public.site_visits
    WHERE first_seen_at < now() - make_interval(days => visit_days)
    ORDER BY first_seen_at
    LIMIT _batch
  );
  GET DIAGNOSTICS visits_removed = ROW_COUNT;

  SELECT p.days INTO telemetry_days FROM public.retention_policies p WHERE p.data_type = 'telemetry';
  telemetry_days := COALESCE(telemetry_days, 30);
  DELETE FROM public.application_telemetry
  WHERE id IN (
    SELECT id FROM public.application_telemetry
    WHERE created_at < now() - make_interval(days => telemetry_days)
    ORDER BY created_at, id
    LIMIT _batch
  );
  GET DIAGNOSTICS telemetry_removed = ROW_COUNT;

  -- Chats last: the purge briefly locks support requests, so it runs after the other deletes.
  FOR i IN 1..10 LOOP
    step := public.purge_expired_chats_bounded();
    chats_removed := chats_removed + step;
    EXIT WHEN step < 100;
  END LOOP;

  INSERT INTO public.admin_activity(actor_id, actor_email, action, target)
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system',
    'retention.daily_cleanup',
    'chats=' || chats_removed || ' rate_limits=' || rate_removed || ' visits=' || visits_removed || ' telemetry=' || telemetry_removed
  );

  RETURN jsonb_build_object(
    'chats', chats_removed,
    'rate_limits', rate_removed,
    'visits', visits_removed,
    'telemetry', telemetry_removed
  );
END
$$;


--
-- Name: settings_safe_value(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settings_safe_value(v jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$ DECLARE result jsonb; k text; x jsonb; s text; BEGIN IF jsonb_typeof(v)='object' THEN result='{}'::jsonb; FOR k,x IN SELECT * FROM jsonb_each(v) LOOP IF k !~* '(key|secret|token|password|authorization|cookie)' THEN result=result||jsonb_build_object(k,public.settings_safe_value(x)); END IF; END LOOP; RETURN result; ELSIF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(public.settings_safe_value(value)),'[]'::jsonb) INTO result FROM jsonb_array_elements(v); RETURN result; ELSIF jsonb_typeof(v)='string' THEN s=v#>>'{}'; s=regexp_replace(s,'(https://[^[:space:]?]+)\?[^[:space:]]+','\1','g'); s=regexp_replace(s,'(sk-[a-zA-Z0-9_-]{12,}|gsk_[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)','[redacted]','g'); RETURN to_jsonb(s); END IF; RETURN v; END $$;


--
-- Name: settings_section_value(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settings_section_value(source_name text, section_name text, row_value jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$ DECLARE keys text[]; result jsonb; BEGIN IF source_name='site_settings' THEN keys=CASE section_name WHEN 'general' THEN ARRAY['display_title','display_title_en','arabic_title','tagline','tagline_en','description','description_en','footer_text','footer_text_en','footer_links','logo_url'] WHEN 'appearance' THEN ARRAY['heading_font','body_font','colors','design_theme','image_fit','image_brightness','image_contrast','image_saturation','image_sharpen','motion_enabled','motion_speed','motion_direction'] WHEN 'navigation' THEN ARRAY['navigation_items','nav_style','mobile_nav_style'] WHEN 'features' THEN ARRAY['feature_flags'] WHEN 'contact_info' THEN ARRAY['contact_info'] WHEN 'categories' THEN ARRAY['categories','categories_en'] WHEN 'customize' THEN ARRAY['theme_customizations'] WHEN 'terms' THEN ARRAY['terms_content'] WHEN 'archy' THEN ARRAY['archy_greeting'] ELSE ARRAY[]::text[] END; ELSIF source_name='ai_assistant_settings' AND section_name='ai' THEN keys=ARRAY['base_url','model','speed']; ELSIF source_name='contact_settings' AND section_name='notifications' THEN keys=ARRAY['recipient_email','notify_enabled','auto_reply_enabled','auto_reply_text']; ELSE RAISE EXCEPTION 'Unsupported settings section'; END IF; SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO result FROM jsonb_each(row_value) WHERE key=ANY(keys); RETURN public.settings_safe_value(result); END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    actor_email text DEFAULT ''::text NOT NULL,
    action text NOT NULL,
    target text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_activity_action_check CHECK ((char_length(action) <= 60)),
    CONSTRAINT admin_activity_target_check CHECK ((char_length(target) <= 200))
);


--
-- Name: TABLE admin_activity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_activity IS 'Append-only admin audit log; written by server functions with service role only.';


--
-- Name: affiliates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliates (
    id text NOT NULL,
    title_ar text DEFAULT ''::text NOT NULL,
    title_en text DEFAULT ''::text NOT NULL,
    description_ar text DEFAULT ''::text NOT NULL,
    description_en text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_assistant_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_assistant_settings (
    id boolean DEFAULT true NOT NULL,
    base_url text DEFAULT 'https://api.groq.com/openai/v1'::text NOT NULL,
    model text DEFAULT 'openai/gpt-oss-120b'::text NOT NULL,
    speed text DEFAULT 'balanced'::text NOT NULL,
    api_key text,
    key_changed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text DEFAULT ''::text NOT NULL,
    CONSTRAINT ai_assistant_settings_id_check CHECK (id),
    CONSTRAINT ai_assistant_settings_speed_check CHECK ((speed = ANY (ARRAY['fast'::text, 'balanced'::text, 'thorough'::text])))
);


--
-- Name: COLUMN ai_assistant_settings.api_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_assistant_settings.api_key IS 'Encrypted at rest (enc:v1 AES-GCM, server-only key). Never store plain text.';


--
-- Name: application_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation text NOT NULL,
    outcome text NOT NULL,
    duration_ms integer NOT NULL,
    code text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_telemetry_code_check CHECK ((code = ANY (ARRAY['none'::text, 'provider'::text, 'storage'::text, 'receipt'::text, 'internal'::text]))),
    CONSTRAINT application_telemetry_duration_ms_check CHECK (((duration_ms >= 0) AND (duration_ms <= 300000))),
    CONSTRAINT application_telemetry_operation_check CHECK ((operation = ANY (ARRAY['assistant'::text, 'recommendation'::text, 'request'::text]))),
    CONSTRAINT application_telemetry_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text])))
);


--
-- Name: TABLE application_telemetry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.application_telemetry IS 'Bounded sanitized outcome/duration telemetry; no prompts, keys or visitor identity; conservative 30 day default.';


--
-- Name: archy_tour_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archy_tour_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    chat_opened_at timestamp with time zone,
    visitor_id uuid,
    visitor_name text DEFAULT ''::text NOT NULL,
    visitor_email text DEFAULT ''::text NOT NULL,
    support_request_id uuid,
    support_submitted_at timestamp with time zone,
    transformation_opened_at timestamp with time zone
);


--
-- Name: assistant_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    question text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_email text NOT NULL,
    visitor_name text DEFAULT ''::text NOT NULL,
    reply text NOT NULL,
    language text DEFAULT 'ar'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE assistant_replies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assistant_replies IS 'DEPRECATED: no longer written; AI replies are read from live_chat_messages (sender = ai). Kept only for 8 replies from before stored chats existed (22 Oct - 12 Nov 2026).';


--
-- Name: contact_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_settings (
    id boolean DEFAULT true NOT NULL,
    recipient_email text DEFAULT 'ea@e20e.tools'::text NOT NULL,
    notify_enabled boolean DEFAULT true NOT NULL,
    auto_reply_enabled boolean DEFAULT false NOT NULL,
    auto_reply_text text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text DEFAULT ''::text NOT NULL,
    CONSTRAINT contact_settings_singleton CHECK (id)
);


--
-- Name: faq_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faq_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_by text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faq_answers_answer_check CHECK (((char_length(answer) >= 1) AND (char_length(answer) <= 2000))),
    CONSTRAINT faq_answers_question_check CHECK (((char_length(question) >= 1) AND (char_length(question) <= 500)))
);


--
-- Name: journey_aggregates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journey_aggregates (
    day date DEFAULT ((now() AT TIME ZONE 'Asia/Riyadh'::text))::date NOT NULL,
    event text NOT NULL,
    language text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    rating_sum integer DEFAULT 0 NOT NULL,
    CONSTRAINT journey_aggregates_count_check CHECK (((count >= 0) AND (count <= 10000000))),
    CONSTRAINT journey_aggregates_event_check CHECK ((event = ANY (ARRAY['chooser_started'::text, 'chooser_completed'::text, 'comparison_opened'::text, 'comparison_tool_opened'::text, 'demo_completed'::text, 'request_completed'::text, 'journey_rating'::text]))),
    CONSTRAINT journey_aggregates_language_check CHECK ((language = ANY (ARRAY['ar'::text, 'en'::text]))),
    CONSTRAINT journey_aggregates_rating_sum_check CHECK (((rating_sum >= 0) AND (rating_sum <= 50000000)))
);


--
-- Name: journey_event_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journey_event_receipts (
    event_key uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE journey_event_receipts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.journey_event_receipts IS 'Service-only random or request-specific idempotency keys; no visitor, account, email, URL, fingerprint or free-text data.';


--
-- Name: live_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    sender text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_chat_messages_sender_check CHECK ((sender = ANY (ARRAY['visitor'::text, 'ai'::text, 'admin'::text, 'system'::text])))
);


--
-- Name: live_chat_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_chat_ratings (
    chat_id uuid NOT NULL,
    visitor_id uuid NOT NULL,
    stars smallint NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_chat_ratings_comment_check CHECK ((char_length(comment) <= 500)),
    CONSTRAINT live_chat_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)))
);


--
-- Name: live_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid NOT NULL,
    visitor_email text NOT NULL,
    visitor_name text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'ai'::text NOT NULL,
    language text DEFAULT 'ar'::text NOT NULL,
    requested_at timestamp with time zone,
    admin_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    start_page text DEFAULT ''::text NOT NULL,
    last_page text DEFAULT ''::text NOT NULL,
    CONSTRAINT live_chats_status_check CHECK ((status = ANY (ARRAY['ai'::text, 'waiting'::text, 'active'::text, 'closed'::text])))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'architecture'::text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    overview text DEFAULT ''::text NOT NULL,
    features text[] DEFAULT '{}'::text[] NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    keywords text DEFAULT ''::text NOT NULL,
    coming_soon boolean DEFAULT false NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    image_alt text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    whats_new text DEFAULT ''::text NOT NULL,
    label_en text DEFAULT ''::text NOT NULL,
    description_en text DEFAULT ''::text NOT NULL,
    overview_en text DEFAULT ''::text NOT NULL,
    features_en text[] DEFAULT '{}'::text[] NOT NULL,
    image_alt_en text DEFAULT ''::text NOT NULL,
    whats_new_en text DEFAULT ''::text NOT NULL,
    github_url text DEFAULT 'https://github.com/e20etools/'::text NOT NULL,
    publication_date date,
    beneficiary_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT products_beneficiary_details_object CHECK ((jsonb_typeof(beneficiary_details) = 'object'::text))
);


--
-- Name: COLUMN products.label_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.label_en IS 'English category label shown on library cards.';


--
-- Name: COLUMN products.description_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.description_en IS 'English visitor copy for the short description. An empty value falls back to description.';


--
-- Name: COLUMN products.overview_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.overview_en IS 'English visitor copy for the product overview. An empty value falls back to overview.';


--
-- Name: COLUMN products.features_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.features_en IS 'English feature bullets shown on the visitor product page. An empty array falls back to features.';


--
-- Name: COLUMN products.image_alt_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.image_alt_en IS 'English alternative text for the product illustration.';


--
-- Name: COLUMN products.whats_new_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.whats_new_en IS 'English release note for the current version.';


--
-- Name: COLUMN products.publication_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.publication_date IS 'Optional planned publication date, editable in the product information settings.';


--
-- Name: COLUMN products.beneficiary_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.beneficiary_details IS 'Optional bilingual beneficiary fit, discovery and educational metadata; empty means not provided.';


--
-- Name: rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_events (
    id bigint NOT NULL,
    bucket text NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE rate_limit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rate_limit_events IS 'Server-only throttle log. Subjects are SHA-256 hashes, never raw IPs or emails.';


--
-- Name: rate_limit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rate_limit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: request_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_identities (
    request_id uuid NOT NULL,
    visitor_id uuid,
    account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT request_identities_one_owner CHECK ((((visitor_id IS NOT NULL) AND (account_id IS NULL)) OR ((visitor_id IS NULL) AND (account_id IS NOT NULL))))
);


--
-- Name: TABLE request_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.request_identities IS 'Service-only ownership links. Visitor IDs come from signed server-minted Archy tokens; account IDs come from verified bearer subjects, never typed email.';


--
-- Name: request_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    author_email text DEFAULT ''::text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_policies (
    data_type text NOT NULL,
    days integer NOT NULL,
    manual_enabled boolean DEFAULT false NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT retention_policies_data_type_check CHECK ((data_type = ANY (ARRAY['chats'::text, 'visits'::text, 'telemetry'::text]))),
    CONSTRAINT retention_policies_days_check CHECK (((days >= 30) AND (days <= 730)))
);


--
-- Name: settings_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section text NOT NULL,
    source text NOT NULL,
    actor_id uuid,
    actor_label text DEFAULT ''::text NOT NULL,
    previous_value jsonb NOT NULL,
    new_value jsonb NOT NULL,
    restored_from uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE settings_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settings_versions IS 'Section-scoped sanitized settings history from activation onward; never credential history; retain for required audit.';


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id boolean DEFAULT true NOT NULL,
    display_title text DEFAULT 'E20E Tools.'::text NOT NULL,
    arabic_title text DEFAULT ''::text NOT NULL,
    description text DEFAULT 'منتجات متخصصة في البنية المؤسسية وإدارة التقنيات. اختر الأداة المناسبة لاحتياجك.'::text NOT NULL,
    logo_url text DEFAULT ''::text NOT NULL,
    heading_font text DEFAULT 'Alexandria'::text NOT NULL,
    body_font text DEFAULT 'Alexandria'::text NOT NULL,
    colors jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    categories jsonb DEFAULT '{}'::jsonb NOT NULL,
    footer_text text DEFAULT 'Build with ♥ By E20E.Tools & DT.Guide'::text NOT NULL,
    description_en text DEFAULT ''::text NOT NULL,
    categories_en jsonb DEFAULT '{}'::jsonb NOT NULL,
    display_title_en text DEFAULT ''::text NOT NULL,
    footer_text_en text DEFAULT ''::text NOT NULL,
    navigation_items jsonb,
    tagline text DEFAULT 'EA Tools Build by EA to EA.'::text NOT NULL,
    tagline_en text DEFAULT ''::text NOT NULL,
    nav_style text DEFAULT 'glass'::text NOT NULL,
    motion_enabled boolean DEFAULT true NOT NULL,
    motion_speed numeric DEFAULT 1 NOT NULL,
    motion_direction text DEFAULT 'normal'::text NOT NULL,
    image_fit text DEFAULT 'contain'::text NOT NULL,
    image_brightness numeric DEFAULT 1 NOT NULL,
    image_contrast numeric DEFAULT 1 NOT NULL,
    image_saturation numeric DEFAULT 1 NOT NULL,
    image_sharpen boolean DEFAULT false NOT NULL,
    mobile_nav_style text DEFAULT 'sheet'::text NOT NULL,
    feature_flags jsonb DEFAULT '{"blog": true, "roadmap": true, "support": true, "assistant": true, "affiliates": true, "recommendations": true}'::jsonb NOT NULL,
    contact_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    design_theme jsonb DEFAULT '{"theme": "classic", "intensity": "medium", "animations": true}'::jsonb NOT NULL,
    footer_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    theme_customizations jsonb DEFAULT '{}'::jsonb NOT NULL,
    terms_content jsonb DEFAULT '{}'::jsonb NOT NULL,
    archy_greeting jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT footer_links_array CHECK ((jsonb_typeof(footer_links) = 'array'::text)),
    CONSTRAINT site_settings_archy_greeting_object CHECK (((jsonb_typeof(archy_greeting) = 'object'::text) AND (pg_column_size(archy_greeting) < 4096))),
    CONSTRAINT site_settings_motion_direction_check CHECK ((motion_direction = ANY (ARRAY['normal'::text, 'reverse'::text, 'alternate'::text]))),
    CONSTRAINT site_settings_motion_speed_check CHECK (((motion_speed >= 0.25) AND (motion_speed <= (3)::numeric))),
    CONSTRAINT site_settings_singleton CHECK (id),
    CONSTRAINT site_settings_terms_content_object CHECK (((jsonb_typeof(terms_content) = 'object'::text) AND (pg_column_size(terms_content) < 65536))),
    CONSTRAINT site_settings_theme_customizations_object CHECK (((jsonb_typeof(theme_customizations) = 'object'::text) AND (pg_column_size(theme_customizations) < 65536)))
);


--
-- Name: COLUMN site_settings.arabic_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.arabic_title IS 'Optional Arabic subtitle shown under the latin title. An empty string hides the subtitle.';


--
-- Name: COLUMN site_settings.categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.categories IS 'Map of category id to its display name shown in the library filter bar.';


--
-- Name: COLUMN site_settings.description_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.description_en IS 'English organisation description shown in the site header and request page. An empty value falls back to description.';


--
-- Name: COLUMN site_settings.categories_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.categories_en IS 'Map of category id to its English display name.';


--
-- Name: COLUMN site_settings.navigation_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.navigation_items IS 'Ordered bilingual visitor navigation; null uses application defaults, an empty array hides all menu links.';


--
-- Name: COLUMN site_settings.theme_customizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.site_settings.theme_customizations IS 'Per-design overrides keyed by design id: colours, sizes, logo, background and product pictures (storage paths).';


--
-- Name: site_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visits (
    visitor_key text NOT NULL,
    day date NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suggestion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suggestion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    need text NOT NULL,
    recommendation jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    status_updated_at timestamp with time zone,
    request_type text DEFAULT 'new'::text NOT NULL,
    product_id text,
    urgency text,
    impact text DEFAULT ''::text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT suggestion_requests_details_object CHECK (((jsonb_typeof(details) = 'object'::text) AND (pg_column_size(details) < 8192))),
    CONSTRAINT suggestion_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text, 'rejected'::text]))),
    CONSTRAINT suggestion_requests_type_check CHECK ((request_type = ANY (ARRAY['new'::text, 'feature'::text, 'support'::text, 'general'::text, 'service'::text]))),
    CONSTRAINT suggestion_requests_urgency_check CHECK (((urgency IS NULL) OR (urgency = ANY (ARRAY['low'::text, 'normal'::text, 'urgent'::text]))))
);


--
-- Name: COLUMN suggestion_requests.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suggestion_requests.phone IS 'Visitor phone number collected by the suggestion request form.';


--
-- Name: support_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_type text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    organization text DEFAULT ''::text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    status_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_offers_offer_type_check CHECK ((offer_type = ANY (ARRAY['partnership'::text, 'financial'::text, 'contribution'::text]))),
    CONSTRAINT support_offers_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role_ar text DEFAULT ''::text NOT NULL,
    role_en text DEFAULT ''::text NOT NULL,
    organization_ar text DEFAULT ''::text NOT NULL,
    organization_en text DEFAULT ''::text NOT NULL,
    quote_ar text DEFAULT ''::text NOT NULL,
    quote_en text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testimonials_check CHECK (((char_length(quote_ar) > 0) OR (char_length(quote_en) > 0))),
    CONSTRAINT testimonials_image_url_check CHECK ((char_length(image_url) <= 400)),
    CONSTRAINT testimonials_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT testimonials_organization_ar_check CHECK ((char_length(organization_ar) <= 160)),
    CONSTRAINT testimonials_organization_en_check CHECK ((char_length(organization_en) <= 160)),
    CONSTRAINT testimonials_quote_ar_check CHECK ((char_length(quote_ar) <= 1200)),
    CONSTRAINT testimonials_quote_en_check CHECK ((char_length(quote_en) <= 1200)),
    CONSTRAINT testimonials_role_ar_check CHECK ((char_length(role_ar) <= 160)),
    CONSTRAINT testimonials_role_en_check CHECK ((char_length(role_en) <= 160))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: admin_activity admin_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity
    ADD CONSTRAINT admin_activity_pkey PRIMARY KEY (id);


--
-- Name: affiliates affiliates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_pkey PRIMARY KEY (id);


--
-- Name: ai_assistant_settings ai_assistant_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_assistant_settings
    ADD CONSTRAINT ai_assistant_settings_pkey PRIMARY KEY (id);


--
-- Name: application_telemetry application_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_telemetry
    ADD CONSTRAINT application_telemetry_pkey PRIMARY KEY (id);


--
-- Name: archy_tour_visits archy_tour_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archy_tour_visits
    ADD CONSTRAINT archy_tour_visits_pkey PRIMARY KEY (id);


--
-- Name: assistant_registrations assistant_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_registrations
    ADD CONSTRAINT assistant_registrations_pkey PRIMARY KEY (id);


--
-- Name: assistant_replies assistant_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_replies
    ADD CONSTRAINT assistant_replies_pkey PRIMARY KEY (id);


--
-- Name: contact_settings contact_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_settings
    ADD CONSTRAINT contact_settings_pkey PRIMARY KEY (id);


--
-- Name: faq_answers faq_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq_answers
    ADD CONSTRAINT faq_answers_pkey PRIMARY KEY (id);


--
-- Name: journey_aggregates journey_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journey_aggregates
    ADD CONSTRAINT journey_aggregates_pkey PRIMARY KEY (day, event, language);


--
-- Name: journey_event_receipts journey_event_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journey_event_receipts
    ADD CONSTRAINT journey_event_receipts_pkey PRIMARY KEY (event_key);


--
-- Name: live_chat_messages live_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_messages
    ADD CONSTRAINT live_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: live_chat_ratings live_chat_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_ratings
    ADD CONSTRAINT live_chat_ratings_pkey PRIMARY KEY (chat_id);


--
-- Name: live_chats live_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chats
    ADD CONSTRAINT live_chats_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_events rate_limit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_events
    ADD CONSTRAINT rate_limit_events_pkey PRIMARY KEY (id);


--
-- Name: request_identities request_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_identities
    ADD CONSTRAINT request_identities_pkey PRIMARY KEY (request_id);


--
-- Name: request_replies request_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_replies
    ADD CONSTRAINT request_replies_pkey PRIMARY KEY (id);


--
-- Name: retention_policies retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (data_type);


--
-- Name: settings_versions settings_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings_versions
    ADD CONSTRAINT settings_versions_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: site_visits site_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_pkey PRIMARY KEY (visitor_key, day);


--
-- Name: suggestion_requests suggestion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_requests
    ADD CONSTRAINT suggestion_requests_pkey PRIMARY KEY (id);


--
-- Name: support_offers support_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_offers
    ADD CONSTRAINT support_offers_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: admin_activity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_activity_created_idx ON public.admin_activity USING btree (created_at DESC);


--
-- Name: application_telemetry_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_telemetry_created_idx ON public.application_telemetry USING btree (created_at DESC);


--
-- Name: archy_tour_visits_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archy_tour_visits_started_idx ON public.archy_tour_visits USING btree (started_at DESC);


--
-- Name: assistant_replies_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assistant_replies_created_at_idx ON public.assistant_replies USING btree (created_at DESC);


--
-- Name: live_chat_messages_chat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_chat_messages_chat_idx ON public.live_chat_messages USING btree (chat_id, created_at);


--
-- Name: live_chats_last_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_chats_last_idx ON public.live_chats USING btree (last_message_at DESC);


--
-- Name: live_chats_visitor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_chats_visitor_idx ON public.live_chats USING btree (visitor_id, last_message_at DESC);


--
-- Name: rate_limit_events_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_events_lookup ON public.rate_limit_events USING btree (bucket, subject, created_at);


--
-- Name: request_identities_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_identities_account_idx ON public.request_identities USING btree (account_id, created_at DESC) WHERE (account_id IS NOT NULL);


--
-- Name: request_identities_visitor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_identities_visitor_idx ON public.request_identities USING btree (visitor_id, created_at DESC) WHERE (visitor_id IS NOT NULL);


--
-- Name: request_replies_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_replies_request_idx ON public.request_replies USING btree (request_id, created_at);


--
-- Name: settings_versions_section_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settings_versions_section_idx ON public.settings_versions USING btree (section, created_at DESC);


--
-- Name: site_visits_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_visits_day_idx ON public.site_visits USING btree (day);


--
-- Name: suggestion_requests_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suggestion_requests_type_created_idx ON public.suggestion_requests USING btree (request_type, created_at DESC);


--
-- Name: support_offers_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_offers_created_idx ON public.support_offers USING btree (created_at DESC);


--
-- Name: support_offers_email_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_offers_email_created_idx ON public.support_offers USING btree (email, created_at DESC);


--
-- Name: ai_assistant_settings phase_six_ai_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER phase_six_ai_history AFTER INSERT OR UPDATE ON public.ai_assistant_settings FOR EACH ROW EXECUTE FUNCTION public.capture_settings_version();


--
-- Name: contact_settings phase_six_contact_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER phase_six_contact_history AFTER INSERT OR UPDATE ON public.contact_settings FOR EACH ROW EXECUTE FUNCTION public.capture_settings_version();


--
-- Name: retention_policies phase_six_retention_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER phase_six_retention_validate BEFORE INSERT OR UPDATE ON public.retention_policies FOR EACH ROW EXECUTE FUNCTION public.retention_policy_validation();


--
-- Name: site_settings phase_six_site_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER phase_six_site_history AFTER INSERT OR UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.capture_settings_version();


--
-- Name: archy_tour_visits archy_tour_visits_support_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archy_tour_visits
    ADD CONSTRAINT archy_tour_visits_support_request_id_fkey FOREIGN KEY (support_request_id) REFERENCES public.suggestion_requests(id) ON DELETE SET NULL;


--
-- Name: live_chat_messages live_chat_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_messages
    ADD CONSTRAINT live_chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.live_chats(id) ON DELETE CASCADE;


--
-- Name: live_chat_ratings live_chat_ratings_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_ratings
    ADD CONSTRAINT live_chat_ratings_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.live_chats(id) ON DELETE CASCADE;


--
-- Name: request_identities request_identities_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_identities
    ADD CONSTRAINT request_identities_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.suggestion_requests(id) ON DELETE CASCADE;


--
-- Name: request_replies request_replies_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_replies
    ADD CONSTRAINT request_replies_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.suggestion_requests(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contact_settings Admins can insert contact settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert contact settings" ON public.contact_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: contact_settings Admins can read contact settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read contact settings" ON public.contact_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: contact_settings Admins can update contact settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update contact settings" ON public.contact_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: testimonials Admins can view all testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all testimonials" ON public.testimonials FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: archy_tour_visits Admins read Archy tour visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read Archy tour visits" ON public.archy_tour_visits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_activity Admins read activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read activity" ON public.admin_activity FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: live_chat_messages Admins read all chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all chat messages" ON public.live_chat_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: live_chats Admins read all chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all chats" ON public.live_chats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: affiliates Public can view affiliates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view affiliates" ON public.affiliates FOR SELECT TO authenticated, anon USING (true);


--
-- Name: testimonials Public can view published testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view published testimonials" ON public.testimonials FOR SELECT TO authenticated, anon USING ((published = true));


--
-- Name: live_chat_messages Visitors read own chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visitors read own chat messages" ON public.live_chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.live_chats c
  WHERE ((c.id = live_chat_messages.chat_id) AND (c.visitor_id = auth.uid())))));


--
-- Name: live_chats Visitors read own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visitors read own chats" ON public.live_chats FOR SELECT TO authenticated USING ((visitor_id = auth.uid()));


--
-- Name: faq_answers admin reads faq answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin reads faq answers" ON public.faq_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: live_chat_ratings admin reads ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin reads ratings" ON public.live_chat_ratings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: products admins manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage products" ON public.products TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings admins manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage settings" ON public.site_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: affiliates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_assistant_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_assistant_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: application_telemetry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.application_telemetry ENABLE ROW LEVEL SECURITY;

--
-- Name: archy_tour_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.archy_tour_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: faq_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faq_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: journey_aggregates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journey_aggregates ENABLE ROW LEVEL SECURITY;

--
-- Name: journey_aggregates journey_aggregates_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journey_aggregates_admin_read ON public.journey_aggregates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: journey_event_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journey_event_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: live_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: live_chat_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_chat_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: live_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products are readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "products are readable by everyone" ON public.products FOR SELECT TO authenticated, anon USING (true);


--
-- Name: rate_limit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: request_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: request_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: retention_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: retention_policies retention_policies_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retention_policies_admin_read ON public.retention_policies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings settings are readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "settings are readable by everyone" ON public.site_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: settings_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: settings_versions settings_versions_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_versions_admin_read ON public.settings_versions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: suggestion_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suggestion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: support_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: live_chat_ratings visitor reads own rating; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "visitor reads own rating" ON public.live_chat_ratings FOR SELECT TO authenticated USING ((visitor_id = auth.uid()));


--
-- Name: supabase_realtime live_chat_messages; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.live_chat_messages;


--
-- Name: supabase_realtime live_chats; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.live_chats;


--
-- PostgreSQL database dump complete
--



