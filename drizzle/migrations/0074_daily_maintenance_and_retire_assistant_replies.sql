CREATE OR REPLACE FUNCTION public.run_daily_maintenance(_batch integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.run_daily_maintenance(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_maintenance(integer) TO service_role;

COMMENT ON TABLE public.assistant_replies IS 'DEPRECATED: no longer written; AI replies are read from live_chat_messages (sender = ai). Kept only for 8 replies from before stored chats existed (22 Oct - 12 Nov 2026).';