-- Semantic search: one row per indexed passage (product, release notes or approved FAQ answer,
-- per language) with its embedding. Written and read by the server only (service_role); the
-- daily job re-embeds a row only when its text or model changes. Vectors are compared on the
-- server, so no database extension is needed at this size (a few hundred rows).
create table if not exists public.semantic_documents (
  id text primary key check (length(id) between 1 and 200),
  kind text not null check (kind in ('product', 'release', 'faq')),
  language text not null check (language in ('ar', 'en')),
  title text not null check (length(title) between 1 and 300),
  body text not null check (length(body) between 1 and 8000),
  url text not null check (url like '/%' and url not like '//%'),
  content_hash text not null,
  model text not null,
  embedding real[] not null check (cardinality(embedding) between 64 and 3072),
  updated_at timestamptz not null default now()
);
alter table public.semantic_documents enable row level security;
revoke all on public.semantic_documents from public, anon, authenticated;
grant select, insert, update, delete on public.semantic_documents to service_role;
