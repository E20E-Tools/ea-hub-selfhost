CREATE TABLE public.ai_assistant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_url text NOT NULL DEFAULT 'https://api.groq.com/openai/v1',
  model text NOT NULL DEFAULT 'openai/gpt-oss-120b',
  speed text NOT NULL DEFAULT 'balanced' CHECK (speed IN ('fast','balanced','thorough')),
  api_key text,
  key_changed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT ''
);
GRANT ALL ON public.ai_assistant_settings TO service_role;
ALTER TABLE public.ai_assistant_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.ai_assistant_settings (id) VALUES (true);