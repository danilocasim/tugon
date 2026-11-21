begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
insert into auth.users(id,email,email_confirmed_at) values
 ('84000000-0000-4000-8000-000000000001','intake-resident@example.test',now()),
 ('84000000-0000-4000-8000-000000000002','intake-staff@example.test',now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('84100000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',now(),now()),
 ('84100000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002',now(),now());
insert into public.memberships(user_id,role,name) values
 ('84000000-0000-4000-8000-000000000001','resident','Intake Fixture Resident'),
 ('84000000-0000-4000-8000-000000000002','intake','Intake Fixture Staff');
insert into public.resident_profiles(user_id,purok,lang,notice_version)
values('84000000-0000-4000-8000-000000000001','P1','en','test');

set local role authenticated;
set local request.jwt.claims='{"sub":"84000000-0000-4000-8000-000000000001","session_id":"84100000-0000-4000-8000-000000000001","aal":"aal1"}';
select throws_ok($$select public.submit_resident_report(gen_random_uuid(),'Synthetic unknown landmark','infra',false,'{"method":"landmark","landmarkId":"bogus","lat":14.38,"lon":121.04}',false)$$,'22023','Unknown landmark','Direct RPC cannot invent a landmark');
select throws_ok($$select public.submit_resident_report(gen_random_uuid(),'Synthetic invalid coordinates','infra',false,'{"method":"device","lat":0,"lon":0}',false)$$,'22023','Invalid coordinates','Direct RPC must stay within the service area');
select lives_ok($$select public.submit_resident_report('84200000-0000-4000-8000-000000000001','Canonical online pin case','infra',false,'{"method":"pin","purok":"P1","landmarkId":"hall","lat":14.388,"lon":121.049}',false)$$,'Online report accepts a valid pin and derives its area');
select is((select location from public.service_requests where submission_key='84200000-0000-4000-8000-000000000001'),'{"method":"pin","purok":"P3","landmarkId":null,"lat":14.388,"lon":121.049}'::jsonb,'The supplied zone and landmark are ignored for a pin');
select matches((select ref from public.service_requests where submission_key='84200000-0000-4000-8000-000000000001'),'^TGN-'||to_char(now() at time zone 'Asia/Manila','YYMM')||'-[0-9]{4,}$','Online reports use the prototype reference shape');
select ok((select replayed and ref=(select r.ref from public.service_requests r where submission_key='84200000-0000-4000-8000-000000000001')
  from public.submit_resident_report('84200000-0000-4000-8000-000000000001','Different payload on retry','infra',false,null,false)),'Retry preserves the previously issued reference');
select throws_ok($$select public.submit_assisted_request('phone','Canonical assisted location case','infra',false,null,'Fixture Recipient',null,false,null)$$,'42501','Intake role required','Residents cannot use the assisted path');

set local request.jwt.claims='{"sub":"84000000-0000-4000-8000-000000000002","session_id":"84100000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"},{"method":"totp"}]}';
select lives_ok($$select public.submit_assisted_request('phone','Canonical assisted location case','infra',false,'{"method":"landmark","purok":"P5","lat":14.389,"lon":121.05,"landmarkId":"hall"}','Fixture Recipient',null,false,null)$$,'Assisted intake accepts a supported landmark');
select is((select location from public.service_requests where description='Canonical assisted location case'),'{"method":"landmark","purok":"P1","lat":14.380140,"lon":121.03928,"landmarkId":"hall"}'::jsonb,'The assisted path stores official landmark coordinates instead of supplied coordinates');
select matches((select ref from public.service_requests where description='Canonical assisted location case'),'^TGN-'||to_char(now() at time zone 'Asia/Manila','YYMM')||'-[0-9]{4,}$','Assisted reports use the same reference shape');

reset role;
select * from finish();
rollback;
