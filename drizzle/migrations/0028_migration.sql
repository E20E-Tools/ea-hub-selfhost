CREATE TABLE public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_en text not null default '',
  description text not null default '',
  description_en text not null default '',
  kind text not null default 'event',
  product_id text not null default '',
  event_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events are readable by everyone" ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage events" ON public.events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (auth.jwt() ->> 'aal') = 'aal2');
CREATE OR REPLACE FUNCTION public.validate_event() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.kind not in ('event','workshop') then raise exception 'invalid kind'; end if;
  if length(trim(new.title)) = 0 or length(new.title) > 200 then raise exception 'invalid title'; end if;
  if new.event_date < date '2026-01-01' or new.event_date > date '2027-12-31' then raise exception 'date out of range'; end if;
  new.updated_at := now();
  return new;
end; $$;
CREATE TRIGGER validate_event BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.validate_event();