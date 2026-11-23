alter table public.live_chat_messages
  add column if not exists reply_source text,
  add column if not exists reply_model text,
  add column if not exists reply_language text,
  add column if not exists prompt_id uuid references public.live_chat_messages(id) on delete set null,
  add column if not exists helpful boolean,
  add column if not exists feedback_reason text check (feedback_reason in ('fit','incomplete','other'));

create table if not exists public.archy_cases (
 id uuid primary key default gen_random_uuid(),
 language text not null check(language in ('ar','en')),
 question text not null check(length(question) between 1 and 1200),
 unique(language,question)
);
create table if not exists public.product_reviews (
 product_id text primary key references public.products(id) on delete cascade,
 reviewed_on date not null
);
alter table public.archy_cases enable row level security;
alter table public.product_reviews enable row level security;
revoke all on public.archy_cases,public.product_reviews from public, anon, authenticated;
grant all on public.archy_cases,public.product_reviews to service_role;
create or replace view public.archy_feedback_totals as
select reply_source,reply_model,reply_language,count(*) filter(where helpful) as positive,
 count(*) filter(where not helpful) as negative
from public.live_chat_messages where helpful is not null group by reply_source,reply_model,reply_language;
revoke all on public.archy_feedback_totals from public,anon,authenticated;
grant select on public.archy_feedback_totals to service_role;
insert into public.archy_cases(language,question) values
('ar','كيف أقيّم تقنية جديدة قبل اعتمادها؟'),('en','Which tool can help us assess an emerging technology?'),
('ar','أريد جرد التطبيقات واكتشاف التكرار بينها.'),('en','How do I map our application portfolio?'),
('ar','ما الفرق بين Tech Radar وAPM & App Landscape؟'),('en','How should I choose between Tech Radar and App Landscape?'),
('ar','هل ArchONE متاح الآن؟'),('en','Where can I check whether a product has launched?'),
('ar','كيف أطلب دعمًا فنيًا لمنتج؟'),('en','How can I request a new feature?') on conflict do nothing;
