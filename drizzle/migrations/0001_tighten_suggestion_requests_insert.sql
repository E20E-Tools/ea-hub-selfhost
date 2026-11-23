DROP POLICY IF EXISTS "Anyone can submit a suggestion request" ON public.suggestion_requests;
REVOKE INSERT ON public.suggestion_requests FROM anon;