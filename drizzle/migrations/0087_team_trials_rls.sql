-- Defense in depth for the team-trial tables. They are only reached by the server's
-- direct Postgres connection (POSTGRES_URL, the table owner), never through the API roles.
-- With RLS on and no policies, anon/authenticated see nothing even if the schema is exposed later.
alter table ea_trials.invitations enable row level security;
alter table ea_trials.responses enable row level security;
revoke all on schema ea_trials from anon, authenticated;
revoke all on all tables in schema ea_trials from anon, authenticated;
