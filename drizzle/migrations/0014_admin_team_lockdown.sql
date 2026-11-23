CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $lockdown$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype AND p.pronargs = 0
      AND (p.proname = 'handle_user_email_confirmed'
        OR (p.prosrc ILIKE '%admin_emails%' AND p.prosrc ILIKE '%user_roles%'))
  LOOP
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', f.proname, 'BEGIN RETURN NEW; END;');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', f.proname);
  END LOOP;
END;
$lockdown$;

REVOKE EXECUTE ON FUNCTION public.has_admin_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_owner() TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON TABLE public.admin_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.admin_emails TO service_role;
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_contact_add(actor_id uuid, contact_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE normalized text := lower(btrim(contact_email));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = actor_id AND role = 'admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF normalized IS NULL OR length(normalized) > 255 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized, 0));
  IF EXISTS (SELECT 1 FROM public.admin_emails WHERE lower(btrim(email)) = normalized) THEN RETURN 'duplicate'; END IF;
  INSERT INTO public.admin_emails(email) VALUES (normalized) ON CONFLICT (email) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  RETURN 'added';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_contact_add(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_contact_add(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_contact_remove(actor_id uuid, contact_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE normalized text := lower(btrim(contact_email)); own_email text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = actor_id AND role = 'admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT lower(btrim(email)) INTO own_email FROM auth.users WHERE id = actor_id FOR SHARE;
  IF own_email IS NULL OR own_email = '' OR own_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Account email unavailable';
  END IF;
  IF normalized IS NULL OR length(normalized) > 255 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF normalized = own_email THEN RAISE EXCEPTION 'Cannot remove own email'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized, 0));
  DELETE FROM public.admin_emails WHERE lower(btrim(email)) = normalized;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  RETURN 'removed';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_contact_remove(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_contact_remove(uuid, text) TO service_role;