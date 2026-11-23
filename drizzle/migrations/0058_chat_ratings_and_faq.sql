CREATE TABLE public.live_chat_ratings (
  chat_id uuid PRIMARY KEY REFERENCES public.live_chats(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_chat_ratings TO authenticated;
GRANT ALL ON public.live_chat_ratings TO service_role;
ALTER TABLE public.live_chat_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitor reads own rating" ON public.live_chat_ratings FOR SELECT TO authenticated USING (visitor_id = auth.uid());
CREATE POLICY "admin reads ratings" ON public.live_chat_ratings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.faq_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 2000),
  enabled boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faq_answers TO authenticated;
GRANT ALL ON public.faq_answers TO service_role;
ALTER TABLE public.faq_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads faq answers" ON public.faq_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));