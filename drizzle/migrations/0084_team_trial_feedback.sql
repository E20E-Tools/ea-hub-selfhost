create schema if not exists ea_trials;
revoke all on schema ea_trials from public;
create table if not exists ea_trials.invitations (
  owner_hash text primary key, invite_hash text unique not null, tool text not null, goal text not null,
  created_at timestamptz not null default now()
);
create table if not exists ea_trials.responses (
  invite_hash text not null references ea_trials.invitations(invite_hash) on delete cascade,
  response_id uuid not null, outcome text not null check (outcome in ('yes','partial','no')),
  note text not null, created_at timestamptz not null default now(), primary key(invite_hash,response_id)
);
revoke all on all tables in schema ea_trials from public;
alter table ea_trials.invitations add column if not exists closed boolean not null default false;
