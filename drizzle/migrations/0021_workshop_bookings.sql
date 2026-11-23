CREATE TABLE public.workshop_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, email)
);
GRANT ALL ON public.workshop_bookings TO service_role;
ALTER TABLE public.workshop_bookings ENABLE ROW LEVEL SECURITY;