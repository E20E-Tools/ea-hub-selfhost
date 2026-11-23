"""Byte-exact 0069 checks against an isolated synthetic PostgreSQL fixture only."""
import json
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PSQL = ['psql','-X','-h','/tmp/beneficiary-pg/socket','-p','55433','-U','fixture','-d','postgres','-v','ON_ERROR_STOP=1','-At']
SERVICE = "SET fixture.role='service_role';"
passed = []
def sql(query, prefix=SERVICE, fail=None):
    result = subprocess.run(PSQL+['-c',prefix+query],text=True,capture_output=True)
    if fail:
        assert result.returncode and fail in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return '\n'.join(x for x in result.stdout.strip().splitlines() if x != 'SET')
def check(name, query, expected, prefix=SERVICE):
    value = sql(query, prefix=prefix)
    assert value == str(expected), (name,value,expected)
    passed.append(name)
subprocess.run(PSQL+['-f',str(ROOT/'src/test/fixtures/beneficiary-schema.sql')],check=True,capture_output=True)
subprocess.run(PSQL+['-f',str(ROOT/'drizzle/migrations/0069_beneficiary_experience.sql')],check=True,capture_output=True)
key='725e1a8f-01cb-4cdd-a274-72a373480b31'
check('product metadata defaults empty object',"SELECT beneficiary_details FROM products WHERE id='missing'",'')
sql("INSERT INTO products(id) VALUES('radar');")
check('new product backward compatible',"SELECT beneficiary_details FROM products WHERE id='radar'",'{}')
sql("INSERT INTO products(id,beneficiary_details) VALUES('bad','[]')",fail='products_beneficiary_details_object'); passed.append('non-object metadata rejected')
check('valid aggregate accepted',f"SELECT record_journey_event('chooser_completed','en','{key}')",'t')
check('duplicate event key ignored',f"SELECT record_journey_event('chooser_completed','en','{key}')",'f')
check('duplicate does not increment',"SELECT count FROM journey_aggregates WHERE event='chooser_completed'",1)
sql(f"SELECT record_journey_event('journey_rating','ar','725e1a8f-01cb-4cdd-a274-72a373480b32',5)")
check('numeric rating aggregated',"SELECT rating_sum FROM journey_aggregates WHERE event='journey_rating'",5)
sql("SELECT record_journey_event('request_completed','en','725e1a8f-01cb-4cdd-a274-72a373480b35',NULL)") ; passed.append('server request receipt event supported')
sql(f"SELECT record_journey_event('invented','en','725e1a8f-01cb-4cdd-a274-72a373480b33')",fail='Invalid event'); passed.append('unknown event rejected')
sql(f"SELECT record_journey_event('journey_rating','en','725e1a8f-01cb-4cdd-a274-72a373480b33',6)",fail='Invalid rating'); passed.append('rating bounds enforced')
sql(f"SELECT record_journey_event('chooser_started','en','725e1a8f-01cb-4cdd-a274-72a373480b34')",prefix="SET fixture.role='authenticated';",fail='Forbidden'); passed.append('non-service RPC rejected')
request='f8bcd11c-a841-40d4-a501-13b8f28d74ca'
sql(f"INSERT INTO suggestion_requests(id) VALUES('{request}'); INSERT INTO request_identities(request_id,visitor_id) VALUES('{request}','11111111-1111-4111-8111-111111111111');")
check('signed guest ownership persisted',"SELECT count(*) FROM request_identities WHERE visitor_id IS NOT NULL AND account_id IS NULL",1)
sql(f"INSERT INTO request_identities(request_id,visitor_id,account_id) VALUES('{request}','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111')",fail='request_identities_one_owner'); passed.append('dual ownership rejected')
sql("SELECT count(*) FROM request_identities",prefix="SET fixture.role='authenticated'; SET ROLE authenticated;",fail='permission denied'); passed.append('ownership table has no direct visitor grant')
check('admin policy reads aggregate only',"SELECT count(*) FROM journey_aggregates",3,prefix="SET fixture.role='authenticated'; SET ROLE authenticated;")
sql(f"DELETE FROM suggestion_requests WHERE id='{request}'")
check('synthetic request cascade removes ownership link',"SELECT count(*) FROM request_identities",0)
columns=sql("SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_name='journey_aggregates'")
assert 'email' not in columns and 'url' not in columns and 'visitor' not in columns
passed.append('aggregate schema contains no identity/email/URL columns')
print(json.dumps({'passed':passed,'count':len(passed)},indent=2))
