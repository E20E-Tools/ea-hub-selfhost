CREATE TABLE public.live_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  visitor_email text NOT NULL,
  visitor_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ai',
  language text NOT NULL DEFAULT 'ar',
  requested_at timestamptz,
  admin_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_chats_status_check CHECK (status IN ('ai','waiting','active','closed'))
);
CREATE INDEX live_chats_visitor_idx ON public.live_chats (visitor_id, last_message_at DESC);
CREATE INDEX live_chats_last_idx ON public.live_chats (last_message_at DESC);
GRANT SELECT ON public.live_chats TO authenticated;
GRANT ALL ON public.live_chats TO service_role;
ALTER TABLE public.live_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors read own chats" ON public.live_chats FOR SELECT TO authenticated
  USING (visitor_id = auth.uid());
CREATE POLICY "Admins read all chats" ON public.live_chats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.live_chats(id) ON DELETE CASCADE,
  sender text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_chat_messages_sender_check CHECK (sender IN ('visitor','ai','admin','system'))
);
CREATE INDEX live_chat_messages_chat_idx ON public.live_chat_messages (chat_id, created_at);
GRANT SELECT ON public.live_chat_messages TO authenticated;
GRANT ALL ON public.live_chat_messages TO service_role;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors read own chat messages" ON public.live_chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_chats c WHERE c.id = chat_id AND c.visitor_id = auth.uid()));
CREATE POLICY "Admins read all chat messages" ON public.live_chat_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;