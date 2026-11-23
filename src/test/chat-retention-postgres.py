"""Disposable PostgreSQL check for migration 0070 (chat purge reads retention_policies).
Never uses managed PG environment variables. Run against a fresh local cluster on
socket /tmp/chatret-pg/socket port 55433: python3 src/test/chat-retention-postgres.py
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PSQL = ['psql', '-X', '-h', '/tmp/chatret-pg/socket', '-p', '55433', '-U', 'fixture', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
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

subprocess.run(PSQL + ['-f', str(ROOT/'src/test/fixtures/phase-six-schema.sql')], check=True, capture_output=True)
for name in ['0066_phase_six_operations_history_retention.sql', '0067_phase_six_policy_consistency.sql',
             '0068_phase_six_restore_atomic_safety.sql', '0070_chat_retention_reads_policy.sql']:
    subprocess.run(PSQL + ['-f', str(ROOT/'drizzle/migrations'/name)], check=True, capture_output=True)

def seed():
    sql("DELETE FROM live_chats; INSERT INTO live_chats(status,last_message_at) VALUES"
        "('closed',now()-interval '40 days'),('closed',now()-interval '100 days');")

# No policy row: falls back to 90 days, so only the 100-day-old chat is purged.
sql("DELETE FROM retention_policies WHERE data_type='chats';")
seed()
check('fallback 90 days purges only older chat', "SELECT purge_expired_chats_bounded()", 1)
check('fallback keeps 40-day chat', "SELECT count(*) FROM live_chats", 1)

# Policy row present: the stored days value is used instead of a constant.
sql("ALTER TABLE retention_policies DISABLE TRIGGER USER; INSERT INTO retention_policies(data_type,days,manual_enabled) VALUES('chats',30,true);")
seed()
check('stored 30 days purges both chats', "SELECT purge_expired_chats_bounded()", 2)
sql("UPDATE retention_policies SET days=120 WHERE data_type='chats';")
seed()
check('stored 120 days purges none', "SELECT purge_expired_chats_bounded()", 0)

r = subprocess.run(PSQL + ['-c', "SET fixture.role='authenticated'; SELECT purge_expired_chats_bounded();"], text=True, capture_output=True)
assert r.returncode and 'Forbidden' in r.stderr, r.stderr
passed.append('non-service caller rejected')
print(f"{len(passed)}/{len(passed)} passed: " + '; '.join(passed))
