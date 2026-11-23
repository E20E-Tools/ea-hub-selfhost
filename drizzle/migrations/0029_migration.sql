CREATE TABLE public.email_server_settings (
  id boolean primary key default true check (id),
  sender_email text not null default '',
  sender_name text not null default '',
  smtp_host text not null default '',
  smtp_port integer not null default 587,
  smtp_security text not null default 'starttls',
  smtp_username text not null default '',
  smtp_password text,
  password_changed_at timestamptz,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
GRANT ALL ON public.email_server_settings TO service_role;
ALTER TABLE public.email_server_settings ENABLE ROW LEVEL SECURITY;