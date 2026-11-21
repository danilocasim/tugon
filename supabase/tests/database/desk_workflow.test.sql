begin;
create extension if not exists pgtap with schema extensions;
select plan(32);
insert into auth.users(id,email,email_confirmed_at)
  select ('30000000-0000-4000-8000-00000000000'||i)::uuid, 'desk-'||i||'@example.test', now() from generate_series(1,6) i;
insert into auth.sessions(id,user_id,created_at,updated_at)
  select ('40000000-0000-4000-8000-00000000000'||i)::uuid, ('30000000-0000-4000-8000-00000000000'||i)::uuid, now(), now() from generate_series(1,6) i;
insert into public.memberships(user_id,role,name,team_id) values
 ('30000000-0000-4000-8000-000000000001','resident','Pilot Resident',null),
 ('30000000-0000-4000-8000-000000000002','supervisor','Pilot Supervisor',null),
 ('30000000-0000-4000-8000-000000000003','handler','Works Handler','t_works'),
 ('30000000-0000-4000-8000-000000000004','handler','Other Handler','t_peace'),
 ('30000000-0000-4000-8000-000000000005','admin','Pilot Admin',null),
 ('30000000-0000-4000-8000-000000000006','resident','Other Resident',null);
insert into public.referral_offices(name,scope,contact) values('Synthetic local office','Fixture scope','Fixture contact');
insert into public.resident_profiles(user_id,purok,lang,notice_version) values('30000000-0000-4000-8000-000000000001','P1','en','synthetic');
insert into public.service_requests(id,ref,resident_id,channel,description) values
 ('50000000-0000-4000-8000-000000000001','TGN-TEST-DSK','30000000-0000-4000-8000-000000000001','online','Streetlight not working by the synthetic center.');
insert into public.case_work(request_id,prediction,model_version) values
 ('50000000-0000-4000-8000-000000000001','{"category":"infra","urgency":"normal"}','test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","aal":"aal1","amr":[{"method":"password"}]}';
select is((select count(*) from public.service_requests where ref='TGN-TEST-DSK'),0::bigint,'First factor cannot read the case');
select throws_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','review')$$,'42501','Case unavailable','First factor cannot mutate the case');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','review')$$,'Supervisor reviews resident case');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','ask','{"message":"Which pole is not working?"}')$$,'Supervisor requests details');

set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select status from public.service_requests where ref='TGN-TEST-DSK'),'needs_info','Owner sees the question status');
select lives_ok($$select public.update_my_request('50000000-0000-4000-8000-000000000001','reply','It is the third pole.')$$,'Owner can reply');
select is((select count(*) from public.case_work where request_id='50000000-0000-4000-8000-000000000001'),0::bigint,'Resident cannot see the model or assignment');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000006","session_id":"40000000-0000-4000-8000-000000000006","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select count(*) from public.resident_request_events where request_id='50000000-0000-4000-8000-000000000001'),0::bigint,'Another resident cannot read this timeline');
select throws_ok($$select public.update_my_request('50000000-0000-4000-8000-000000000001','reply','I am not the owner')$$,'42501',null,'Another resident cannot reply to this timeline');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select throws_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','triage','{"category":"infra","urgency":"medium"}')$$,'22023','An override reason is required','A model override cannot omit the reason');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','triage','{"category":"infra","urgency":"medium","reason":"This street is unlit."}')$$,'A confirmed decision routes to Public Works');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000004","session_id":"40000000-0000-4000-8000-000000000004","aal":"aal2","amr":[{"method":"password"}]}';
select is((select count(*) from public.service_requests where ref='TGN-TEST-DSK'),0::bigint,'Wrong team cannot read report content');
select throws_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','claim')$$,'42501','Case unavailable','Wrong team cannot claim the case');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000005","session_id":"40000000-0000-4000-8000-000000000005","aal":"aal2","amr":[{"method":"password"}]}';
select is((select count(*) from public.service_requests where ref='TGN-TEST-DSK'),0::bigint,'Admin cannot inspect case content');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000003","session_id":"40000000-0000-4000-8000-000000000003","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','claim')$$,'Correct handler claims');
select throws_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','claim')$$,'22023','Claim unavailable','Already claimed case rejects another claim');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','start')$$,'Assigned handler starts work');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','note','{"message":"Internal operational note"}')$$,'Handler posts an internal note');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','resolve','{"message":"Crews replaced the damaged streetlight."}')$$,'Handler resolves with an explicit outcome');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select outcome from public.service_requests where ref='TGN-TEST-DSK'),'Crews replaced the damaged streetlight.','Only the intended outcome is public to the owner');
select is((select count(*) from public.internal_case_events where request_id='50000000-0000-4000-8000-000000000001'),0::bigint,'Internal notes are never resident-visible');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000003","session_id":"40000000-0000-4000-8000-000000000003","aal":"aal2","amr":[{"method":"password"}]}';
select throws_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','reopen','{"reason":"New information"}')$$,'22023','Reopen unavailable','Handler cannot reopen a resolved request');
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','reopen','{"reason":"New information"}')$$,'Supervisor may reopen with an audit reason');
select ok((select status='queued' and closed_at is null and outcome is null and not outcome_photo from public.service_requests where ref='TGN-TEST-DSK'),'Reopening removes the previous public outcome and proof');
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000001','refer','{"office":"Synthetic local office","message":"The appropriate local office will handle this."}')$$,'Supervisor can record a referral');
select ok((select status='referred' and referral_office='Synthetic local office' from public.service_requests where ref='TGN-TEST-DSK'),'Referral office and terminal status are retained');
reset role;
insert into public.service_requests(id,ref,channel,description,category,status) values('50000000-0000-4000-8000-000000000002','TGN-TEST-RELEASE','walkin','Synthetic assigned work','infra','in_progress');
insert into public.case_work(request_id,team_id,assignee_id,urgency,started_at) values('50000000-0000-4000-8000-000000000002','t_works','30000000-0000-4000-8000-000000000003','normal',now());
insert into public.service_requests(id,ref,channel,description) values('50000000-0000-4000-8000-000000000003','TGN-TEST-DUP','walkin','Duplicate intake fixture for the same issue.');
set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.change_case('50000000-0000-4000-8000-000000000003','duplicate','{"original":"50000000-0000-4000-8000-000000000001"}')$$,'Supervisor can link an intake duplicate');
select is((select duplicate_of from public.case_work where request_id='50000000-0000-4000-8000-000000000003'),'50000000-0000-4000-8000-000000000001'::uuid,'Duplicate remains linked to its original work record');
set local request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000005","session_id":"40000000-0000-4000-8000-000000000005","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.staff_admin_change('30000000-0000-4000-8000-000000000003',false)$$,'Administrator deactivates the employee');
set local request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000003","session_id":"40000000-0000-4000-8000-000000000003","aal":"aal2","amr":[{"method":"password"}]}';
select is((select count(*) from public.service_requests where ref='TGN-TEST-RELEASE'),0::bigint,'Previous owner loses access immediately');
reset role;
select is((select status from public.service_requests where ref='TGN-TEST-RELEASE'),'queued','Open work returns to the queue');
select is((select assignee_id from public.case_work where request_id='50000000-0000-4000-8000-000000000002'),null::uuid,'Queued work no longer belongs to the deactivated employee');
select * from finish();
rollback;
