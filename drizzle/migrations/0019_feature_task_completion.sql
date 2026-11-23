CREATE TABLE public.feature_task_completion (
 task_id text PRIMARY KEY CHECK (length(task_id) BETWEEN 1 AND 100),
 done boolean NOT NULL DEFAULT false,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT feature_completion_date CHECK ((done AND completed_at IS NOT NULL) OR (NOT done AND completed_at IS NULL))
);
GRANT SELECT ON public.feature_task_completion TO anon, authenticated;
GRANT INSERT, UPDATE ON public.feature_task_completion TO authenticated;
GRANT ALL ON public.feature_task_completion TO service_role;
ALTER TABLE public.feature_task_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public completion evidence" ON public.feature_task_completion FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Verified admins add completion" ON public.feature_task_completion FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.jwt()->>'aal' = 'aal2');
CREATE POLICY "Verified admins update completion" ON public.feature_task_completion FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') AND auth.jwt()->>'aal' = 'aal2') WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.jwt()->>'aal' = 'aal2');
CREATE FUNCTION public.stamp_feature_completion() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 NEW.updated_at := now();
 IF NEW.done THEN
   IF TG_OP = 'UPDATE' AND OLD.done THEN NEW.completed_at := OLD.completed_at;
   ELSE NEW.completed_at := now(); END IF;
 ELSE NEW.completed_at := NULL; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_feature_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_feature_completion BEFORE INSERT OR UPDATE ON public.feature_task_completion FOR EACH ROW EXECUTE FUNCTION public.stamp_feature_completion();