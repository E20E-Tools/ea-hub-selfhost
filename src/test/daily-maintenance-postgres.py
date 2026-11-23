"""Disposable PostgreSQL check for migration 0074 (daily maintenance job).
Never uses managed PG environment variables. Run against a fresh local cluster on
socket /tmp/maint-pg/socket port 55434: python3 src/test/daily-maintenance-postgres.py
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PSQL = ['psql', '-X', '-h', '/tmp/maint-pg/socket', '-p', '55434', '-U', 'fixture', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
SERVICE = "SET fixture.role='service_role';"
passed = []

def sql(query, prefix=SERVICE):
    result = subprocess.run(PSQL + ['-c', prefix + query], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return '\n'.join(x for x in result.stdout.strip().splitlines() if x != 'SET')

def check(name, query, expected):
    value = sql(query)
    assert value == str(expected), (name, value, expected)
    passed.append(name)

def run_file(path):
    r = subprocess.run(PSQL + ['-f', str(path)], text=True, capture_output=True)
    assert r.returncode == 0, (path, r.stderr)

run_file(ROOT/'src/test/fixtures/phase-six-schema.sql')
sql("CREATE TABLE public.rate_limit_events(id bigserial PRIMARY KEY,bucket text,subject text,created_at timestamptz DEFAULT now());"
    "CREATE TABLE public.assistant_replies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reply text);", prefix='')
for name in ['0066_phase_six_operations_history_retention.sql', '0067_phase_six_policy_consistency.sql',
             '0068_phase_six_restore_atomic_safety.sql', '0070_chat_retention_reads_policy.sql',
             '0074_daily_maintenance_and_retire_assistant_replies.sql']:
    run_file(ROOT/'drizzle/migrations'/name)

def seed():
    sql("DELETE FROM rate_limit_events; DELETE FROM site_visits; DELETE FROM application_telemetry; DELETE FROM live_chats; DELETE FROM admin_activity;"
        "INSERT INTO rate_limit_events(bucket,subject,created_at) VALUES('a','x',now()-interval '8 days'),('a','x',now()-interval '6 days');"
        "INSERT INTO site_visits(visitor_key,day,first_seen_at) VALUES('old',current_date-100,now()-interval '100 days'),('mid',current_date-50,now()-interval '50 days'),('new',current_date,now());"
        "INSERT INTO application_telemetry(operation,outcome,duration_ms,created_at) VALUES('assistant','success',1,now()-interval '40 days'),('assistant','success',1,now()-interval '10 days');"
        "INSERT INTO live_chats(status,last_message_at) VALUES('closed',now()-interval '100 days'),('closed',now()-interval '10 days');")

# Defaults: rate limits 7 days, visits 90, telemetry 30, chats from policy (90).
sql("ALTER TABLE retention_policies DISABLE TRIGGER USER; DELETE FROM retention_policies; INSERT INTO retention_policies(data_type,days,manual_enabled) VALUES('chats',90,true);")
seed()
check('defaults remove one row of each kind',
      "SELECT run_daily_maintenance()::text",
      '{"chats": 1, "visits": 1, "telemetry": 1, "rate_limits": 1}')
check('keeps recent rate limit row', "SELECT count(*) FROM rate_limit_events", 1)
check('keeps 50-day visit with 90-day default', "SELECT string_agg(visitor_key, ',' ORDER BY visitor_key) FROM site_visits", 'mid,new')
check('logs the result in admin activity', "SELECT action || ' ' || target FROM admin_activity WHERE action='retention.daily_cleanup'",
      'retention.daily_cleanup chats=1 rate_limits=1 visits=1 telemetry=1')

# Stored policies are honoured: visits 30 days, telemetry 60 days.
sql("INSERT INTO retention_policies(data_type,days,manual_enabled) VALUES('visits',30,true),('telemetry',60,true);")
seed()
sql("SELECT run_daily_maintenance();")
check('stored visits days used', "SELECT string_agg(visitor_key, ',' ORDER BY visitor_key) FROM site_visits", 'new')
check('stored telemetry days used', "SELECT count(*) FROM application_telemetry", 2)

# Batches are bounded.
sql("DELETE FROM rate_limit_events; INSERT INTO rate_limit_events(bucket,subject,created_at) SELECT 'b','y',now()-interval '9 days' FROM generate_series(1,5);")
r = sql("SELECT (run_daily_maintenance(2)->>'rate_limits')")
assert r == '2', r
passed.append('batch size bounds each delete')
r = subprocess.run(PSQL + ['-c', SERVICE + "SELECT run_daily_maintenance(0);"], text=True, capture_output=True)
assert r.returncode and 'Invalid bounds' in r.stderr, r.stderr
passed.append('invalid batch rejected')

r = subprocess.run(PSQL + ['-c', "SET fixture.role='authenticated'; SELECT run_daily_maintenance();"], text=True, capture_output=True)
assert r.returncode and 'Forbidden' in r.stderr, r.stderr
passed.append('non-service caller rejected')
check('assistant_replies marked deprecated, not dropped',
      "SELECT obj_description('public.assistant_replies'::regclass) LIKE 'DEPRECATED:%'", 't')
print(f"{len(passed)}/{len(passed)} passed: " + '; '.join(passed))
