ALTER TABLE public.workshop_bookings
  ADD COLUMN status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('admin','participant')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX workshop_bookings_access_token_key ON public.workshop_bookings(access_token);
GRANT UPDATE ON public.workshop_bookings TO authenticated;
CREATE POLICY "Verified admins update bookings" ON public.workshop_bookings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND ((auth.jwt() ->> 'aal') = 'aal2'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND ((auth.jwt() ->> 'aal') = 'aal2'));