begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users(id,email,email_confirmed_at) values('83000000-0000-4000-8000-000000000001','retention-synthetic@example.test',now());
insert into auth.sessions(id,user_id,created_at,updated_at) values('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',now(),now());
insert into public.memberships(user_id,role,name) values('83000000-0000-4000-8000-000000000001','resident','Synthetic PII');
insert into public.resident_profiles(user_id,purok,lang,notice_version) values('83000000-0000-4000-8000-000000000001','P1','en','test');
insert into public.service_requests(id,ref,channel,resident_id,description,category,status,location,closed_at,submission_key,has_photo)
select ('85000000-0000-4000-8000-00000000000'||i)::uuid,'RETENTION-TEST-'||i,'online','83000000-0000-4000-8000-000000000001','Synthetic address and name','infra','resolved',
 '{"method":"pin","lat":14.38,"lon":121.04,"purok":"P2"}',now()-interval '20 years',('86000000-0000-4000-8000-00000000000'||i)::uuid,i=1 from generate_series(1,2) i;
insert into storage.objects(bucket_id,name) values('report-evidence','83000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-000000000001.jpg');
insert into public.resident_request_events(request_id,event_type,author,message) values('85000000-0000-4000-8000-000000000001','update','staff','Synthetic personal note');
insert into tugon_private.case_legal_holds(request_id,reason) values('85000000-0000-4000-8000-000000000002','Synthetic docket hold');
insert into tugon_private.erasure_requests(id,resident_id,approved_at) values('87000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',now());
select is(public.stage_retention(20),0,'Cutoff job is off without operator approval');
update public.civic_settings set retention_enabled=true,retention_months=120 where singleton;
select is(public.stage_retention(20),1,'Scrubs one expired, non-held report');
select is(public.stage_retention(20),0,'No repeat anonymization on retry');
select is((select ref from public.service_requests where id='85000000-0000-4000-8000-000000000001'),'RETENTION-TEST-1','Reference and aggregate identity remain');
select ok((select resident_id is null and not has_photo and description='' and not location ? 'lat' from public.service_requests where ref='RETENTION-TEST-1'),'Case loses its owner, PII and exact coordinates');
select is((select message from public.resident_request_events where request_id='85000000-0000-4000-8000-000000000001'),null::text,'Timeline bodies are anonymized');
select ok(exists(select 1 from public.pending_evidence_gc() where object_name like '%86000000-0000-4000-8000-000000000001.jpg'),'Object removal persists separately from anonymization');
select ok(not public.stage_approved_erasure(),'Legal hold blocks erasure or revocation of the whole account');
select ok((select active from public.memberships where user_id='83000000-0000-4000-8000-000000000001'),'Account remains available while held');
-- Simulate a documented hold release in this rolled back scratch fixture only.
delete from tugon_private.case_legal_holds where request_id='85000000-0000-4000-8000-000000000002';
select ok(public.stage_approved_erasure(),'Eligible account erasure is staged');
select ok(not public.stage_approved_erasure(),'Staging does not rerun after interruption');
set local role authenticated;
set local request.jwt.claims='{"sub":"83000000-0000-4000-8000-000000000001","session_id":"84000000-0000-4000-8000-000000000001","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select count(*) from public.memberships where user_id='83000000-0000-4000-8000-000000000001'),0::bigint,'Previously issued session no longer traverses RLS');
reset role;
select ok(not exists(select 1 from public.erasure_ready_for_auth() where id='87000000-0000-4000-8000-000000000001'),'Account stays staged until its separately queued Storage object is removed');
select * from finish();
rollback;
