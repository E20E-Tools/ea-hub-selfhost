GRANT SELECT, DELETE ON public.workshop_bookings TO authenticated;

CREATE POLICY "Verified admins read bookings" ON public.workshop_bookings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND ((auth.jwt() ->> 'aal'::text) = 'aal2'::text));

CREATE POLICY "Verified admins cancel bookings" ON public.workshop_bookings
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND ((auth.jwt() ->> 'aal'::text) = 'aal2'::text));