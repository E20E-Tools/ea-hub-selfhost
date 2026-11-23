DROP POLICY IF EXISTS "Public completion evidence" ON public.feature_task_completion;
REVOKE SELECT ON public.feature_task_completion FROM anon;
CREATE POLICY "Verified admins read completion" ON public.feature_task_completion FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND ((auth.jwt() ->> 'aal') = 'aal2'));