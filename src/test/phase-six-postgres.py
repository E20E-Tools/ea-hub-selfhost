"""Disposable PostgreSQL verification; never uses managed PG environment variables.
Run against a fresh local cluster: python3 src/test/phase-six-postgres.py
"""
import json
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
PSQL = ['psql', '-X', '-h', '/tmp/phase-six-pg/socket', '-p', '55432', '-U', 'fixture', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
ACTOR = '11111111-1111-4111-8111-111111111111'
SERVICE = "SET fixture.role='service_role';"
passed = []

def sql(query, prefix=SERVICE, fail=None):
    result = subprocess.run(PSQL + ['-c', prefix + query], text=True, capture_output=True)
    if fail:
        assert result.returncode and fail in result.stderr, result.stderr
        return
    assert result.returncode == 0, result.stderr
    return '\n'.join(x for x in result.stdout.strip().splitlines() if x != 'SET')

def check(name, query, expected):
    value = sql(query)
    assert value == str(expected), (name, value, expected)
    passed.append(name)

def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

subprocess.run(PSQL + ['-f', str(ROOT/'src/test/fixtures/phase-six-schema.sql')], check=True, capture_output=True)
for name in ['0066_phase_six_operations_history_retention.sql','0067_phase_six_policy_consistency.sql','0068_phase_six_restore_atomic_safety.sql']:
    subprocess.run(PSQL + ['-f', str(ROOT/'drizzle/migrations'/name)], check=True, capture_output=True)

sql("INSERT INTO site_settings(id,display_title,feature_flags) VALUES(true,'before','{}');", prefix=SERVICE + f"SET fixture.uid='{ACTOR}'; SET fixture.jwt='{{\"email\":\"owner@fixture.invalid\"}}';")
sql("UPDATE site_settings SET display_title='after' WHERE id=true;", prefix=SERVICE + f"SET fixture.uid='{ACTOR}'; SET fixture.jwt='{{\"email\":\"owner@fixture.invalid\"}}';")
check('authenticated save actor', "SELECT count(*) FROM settings_versions WHERE section='general' AND actor_id='"+ACTOR+"' AND actor_label='owner@fixture.invalid'", 2)
sql("INSERT INTO ai_assistant_settings VALUES(true,'https://api.groq.com/openai/v1','model-before','balanced','enc:v1:synthetic','ai@fixture.invalid',now()); UPDATE ai_assistant_settings SET model='model-after',updated_by='second@fixture.invalid';")
check('service save label no invented UUID', "SELECT count(*) FROM settings_versions WHERE section='ai' AND actor_id IS NULL AND actor_label='second@fixture.invalid'", 1)
check('credential excluded from history', "SELECT count(*) FROM settings_versions WHERE previous_value::text LIKE '%synthetic%' OR new_value::text LIKE '%synthetic%'", 0)
sql("INSERT INTO contact_settings VALUES(true,'inbox@fixture.invalid',true,false,'before','contact@fixture.invalid',now()); UPDATE contact_settings SET auto_reply_text='after',updated_by='contact2@fixture.invalid';")
check('contact service attribution', "SELECT count(*) FROM settings_versions WHERE section='notifications' AND actor_id IS NULL AND actor_label='contact2@fixture.invalid'", 1)
for source,section,column,before,after in [('ai_assistant_settings','ai','model','model-before','model-after'),('contact_settings','notifications','auto_reply_text','before','after')]:
    history = sql(f"SELECT id FROM settings_versions WHERE section='{section}' AND previous_value->>'{column}'='{before}' ORDER BY created_at DESC LIMIT 1")
    old = json.loads(sql(f"SELECT previous_value FROM settings_versions WHERE id='{history}'"))
    current = json.loads(sql(f"SELECT settings_section_value('{source}','{section}',to_jsonb(s)) FROM {source} s"))
    sql(f"SELECT restore_settings_version('{history}',{literal(current)},{literal(old)},'{ACTOR}')")
    check(section+' actual restore value',f"SELECT {column} FROM {source}",before)
    check(section+' restore actor UUID',f"SELECT count(*) FROM settings_versions WHERE restored_from='{history}' AND actor_id='{ACTOR}'",1)
sql("UPDATE site_settings SET feature_flags='{\"assistant\":false}';")
check('service site save does not invent actor',"SELECT count(*) FROM settings_versions WHERE section='features' AND new_value->'feature_flags'->>'assistant'='false' AND actor_id IS NULL AND actor_label=''",1)

version = sql("SELECT id FROM settings_versions WHERE section='general' AND previous_value->>'display_title'='before'")
restore = f"SELECT restore_settings_version('{version}', '{{\"display_title\":\"after\"}}', '{{\"display_title\":\"before\"}}','{ACTOR}')"
sql(restore)
check('actual restore persists section', "SELECT display_title FROM site_settings", 'before')
check('restore appends attributed history', f"SELECT count(*) FROM settings_versions WHERE restored_from='{version}' AND actor_id='{ACTOR}'", 1)
check('restore audit', "SELECT count(*) FROM admin_activity WHERE action='settings.restore'", 3)
sql(f"SELECT restore_settings_version('{version}','{{\"display_title\":\"before\"}}','{{\"display_title\":\"before\"}}','{ACTOR}')")
check('no-op restore still appends', f"SELECT count(*) FROM settings_versions WHERE restored_from='{version}' AND actor_id='{ACTOR}'", 2)
sql(restore, fail='settingsConflict'); passed.append('stale restore rejected')
sql(f"SELECT restore_settings_version('{version}','{{\"display_title\":\"before\"}}','{{\"display_title\":\"forged\"}}','{ACTOR}')",fail='Invalid restore'); passed.append('forged history rejected')
sql(f"SELECT restore_settings_version('{version}','{{\"display_title\":\"before\"}}','{{\"display_title\":\"before\",\"api_key\":\"synthetic\"}}','{ACTOR}')",fail='Invalid restore'); passed.append('secret restore rejected')
sql(restore,prefix="SET fixture.role='authenticated';",fail='Forbidden'); passed.append('non-service RPC rejected')
sql("UPDATE site_settings SET display_title='after';")
with ThreadPoolExecutor(2) as pool:
    results = list(pool.map(lambda _: subprocess.run(PSQL+['-c',SERVICE+restore],capture_output=True,text=True),range(2)))
assert sum(r.returncode==0 for r in results)==1 and any('settingsConflict' in r.stderr for r in results)
passed.append('concurrent restore exactly one wins')

sql("UPDATE ai_assistant_settings SET api_key=NULL,base_url='https://api.openai.com/v1'; UPDATE ai_assistant_settings SET base_url='https://api.groq.com/openai/v1';")
ai_version = sql("SELECT id FROM settings_versions WHERE section='ai' AND previous_value->>'base_url'='https://api.openai.com/v1' ORDER BY created_at DESC LIMIT 1")
ai_previous = sql(f"SELECT previous_value FROM settings_versions WHERE id='{ai_version}'")
ai_current = sql("SELECT settings_section_value('ai_assistant_settings','ai',to_jsonb(s)) FROM ai_assistant_settings s")
sql("UPDATE ai_assistant_settings SET api_key='enc:v1:synthetic-new';")
sql(f"SELECT restore_settings_version('{ai_version}',{literal(json.loads(ai_current))},{literal(json.loads(ai_previous))},'{ACTOR}')",fail='errAiKeyOrigin')
passed.append('credential added after preview cannot cross origin')

sql("INSERT INTO retention_policies(data_type,days,manual_enabled) VALUES('chats',90,true);")
sql("INSERT INTO live_chats(status,last_message_at) VALUES('active',now()-interval '100 days'),('waiting',now()-interval '100 days'),('closed',now()-interval '100 days'),('closed',now()-interval '100 days'),('closed',now()-interval '1 day'); INSERT INTO suggestion_requests(details,status) SELECT jsonb_build_object('chatId',id),'new' FROM live_chats WHERE status='closed' ORDER BY last_message_at LIMIT 1;")
check('active waiting open-support excluded', "SELECT count(*) FROM retention_candidates('chats',90,101)", 1)
candidate = sql("SELECT candidate_id FROM retention_candidates('chats',90,101)")
sql(f"INSERT INTO suggestion_requests(details,status) VALUES(jsonb_build_object('chatId','{candidate}'),'in_progress');")
check('support opened after preview protects candidate', f"SELECT cleanup_retention_batch('chats',ARRAY['{candidate}'],1,'{ACTOR}')", 0)
sql(f"UPDATE suggestion_requests SET status='closed' WHERE details->>'chatId'='{candidate}';")
sql(f"SELECT cleanup_retention_batch('chats',ARRAY['{candidate}'],2,'{ACTOR}')",fail='retentionConflict'); passed.append('policy revision conflict')
sql(f"SELECT cleanup_retention_batch('chats',array_fill('{candidate}'::text,ARRAY[101]),1,'{ACTOR}')",fail='Invalid batch'); passed.append('101 batch rejected')
sql("SELECT retention_candidates('chats',90,102)",fail='Invalid bounds'); passed.append('preview bounds enforced')
sql(f"INSERT INTO live_chat_messages(chat_id,body) VALUES('{candidate}','synthetic'); INSERT INTO live_chat_ratings VALUES('{candidate}',5);")
check('explicit cleanup removes only eligible', f"SELECT cleanup_retention_batch('chats',ARRAY['{candidate}'],1,'{ACTOR}')", 1)
check('active/open support retained', "SELECT count(*) FROM live_chats", 4)
check('chat FK cascades', "SELECT (SELECT count(*) FROM live_chat_messages)+(SELECT count(*) FROM live_chat_ratings)", 0)
sql("INSERT INTO live_chats(status,last_message_at) SELECT 'closed',now()-interval '110 days' FROM generate_series(1,105)")
check('automatic purge bounded 100', "SELECT purge_expired_chats_bounded()", 100)
check('system sentinel audit without FK', "SELECT count(*) FROM admin_activity WHERE actor_id='00000000-0000-0000-0000-000000000000' AND action='retention.chat_expiry'", 1)
check('remaining expired 5', "SELECT count(*) FROM retention_candidates('chats',90,101)", 5)
sql("UPDATE retention_policies SET days=91 WHERE data_type='chats'",fail='90 day'); passed.append('90-day policy enforced')
sql("INSERT INTO retention_policies(data_type,days,manual_enabled) VALUES('visits',90,false),('telemetry',30,true); INSERT INTO site_visits VALUES('synthetic-old',current_date-100,now()-interval '100 days');")
sql(f"SELECT cleanup_retention_batch('visits',ARRAY['synthetic-old|'||(current_date-100)::text],1,'{ACTOR}')",fail='retentionConflict'); passed.append('manual disabled prevents deletion')
sql("UPDATE retention_policies SET manual_enabled=true WHERE data_type='visits';")
check('visits exact candidate cleanup', f"SELECT cleanup_retention_batch('visits',ARRAY['synthetic-old|'||(current_date-100)::text],1,'{ACTOR}')", 1)
sql("INSERT INTO application_telemetry(operation,outcome,duration_ms,created_at) VALUES('request','failure',100,now()-interval '40 days'),('assistant','success',200,now());")
check('telemetry bounded age candidate', "SELECT count(*) FROM retention_candidates('telemetry',30,101)", 1)
check('telemetry exact cleanup', f"SELECT cleanup_retention_batch('telemetry',ARRAY(SELECT candidate_id FROM retention_candidates('telemetry',30,101)),1,'{ACTOR}')", 1)
check('recent telemetry retained', 'SELECT count(*) FROM application_telemetry', 1)
print(json.dumps({'postgres': sql('SHOW server_version'), 'passed':passed,'count':len(passed)},indent=2))