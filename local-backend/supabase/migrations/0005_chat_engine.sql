ALTER TABLE public.ai_assistant_settings ADD COLUMN IF NOT EXISTS chat_engine text CHECK (chat_engine IN ('remote', 'local'));
