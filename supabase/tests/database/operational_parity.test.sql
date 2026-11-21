begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
insert into auth.users(id,email,email_confirmed_at) select ('80000000-0000-4000-8000-00000000000'||i)::uuid,'workflow-'||i||'@example.test',now() from generate_series(1,4) i;
insert into auth.sessions(id,user_id,created_at,updated_at) select ('81000000-0000-4000-8000-00000000000'||i)::uuid,('80000000-0000-4000-8000-00000000000'||i)::uuid,now(),now() from generate_series(1,4) i;
insert into public.memberships(user_id,role,name,team_id) values
 ('80000000-0000-4000-8000-000000000001','resident','Synthetic Resident',null),
 ('80000000-0000-4000-8000-000000000002','supervisor','Synthetic Supervisor',null),
 ('80000000-0000-4000-8000-000000000003','handler','Synthetic Other Team','t_works'),
 ('80000000-0000-4000-8000-000000000004','admin','Synthetic Admin',null);
insert into public.resident_profiles(user_id,purok,lang,notice_version,email_updates) values('80000000-0000-4000-8000-000000000001','P1','en','synthetic',true);
insert into public.service_requests(id,ref,resident_id,channel,description,category,status,location)
select ('82000000-0000-4000-8000-00000000000'||i)::uuid,'SYNTHETIC-OPS-'||i,'80000000-0000-4000-8000-000000000001', 'online', 'Synthetic report details',case when i=4 then 'peace' else 'infra' end,
 case when i=1 or i=4 then 'queued' else 'received' end, jsonb_build_object('lat',14.38+i*0.0001,'lon',121.04,'method','pin','purok','P1') from generate_series(1,4) i;
insert into public.case_work(request_id,team_id,assignee_id,urgency,restricted) values
 ('82000000-0000-4000-8000-000000000001','t_works','80000000-0000-4000-8000-000000000003','normal',false),
 ('82000000-0000-4000-8000-000000000003',null,null,null,true),
 ('82000000-0000-4000-8000-000000000004','t_peace',null,'normal',false);
set local role authenticated;
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000002","session_id":"81000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select throws_ok($$select public.start_incident('Restricted must not join',array['82000000-0000-4000-8000-000000000001'::uuid,'82000000-0000-4000-8000-000000000003'])$$,'22023','A report is not eligible for this incident','Restricted reports cannot join a broadcast');
select lives_ok($$select public.start_incident('Synthetic flood',array['82000000-0000-4000-8000-000000000001'::uuid,'82000000-0000-4000-8000-000000000002'])$$,'Supervisor creates nearby incident');
select is((select (public.change_incident(id,'broadcast',p_message=>'Crew is investigating the street.') ->> 'reached')::int from public.incidents where title='Synthetic flood'),2,'Each linked report gets the update');
select is((select (public.change_incident(id,'broadcast',p_message=>'Crew is investigating the street.') ->> 'reached')::int from public.incidents where title='Synthetic flood'),2,'Identical retry returns the committed count');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select count(*) from public.resident_notifications where resident_id='80000000-0000-4000-8000-000000000001' and kind='update'),1::bigint,'Same resident gets only one notification for the bulk update');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000002","session_id":"81000000-0000-4000-8000-000000000002","aal":"aal2","amr":[{"method":"password"}]}';
select is((select (public.change_incident(id,'close',p_message=>'The affected street is now clear.') ->> 'resolved')::int from public.incidents where title='Synthetic flood'),1,'One assigned report is resolved');
select is((select status from public.service_requests where ref='SYNTHETIC-OPS-2'),'received','Intake report stays in intake after incident closure');
select throws_ok($$select public.file_lupon_case('82000000-0000-4000-8000-000000000004','Party X','Party Y','Fictional street','Synthetic dispute details',true)$$,'42501','Lupon case unavailable','Lupon disabled before approval');
reset role;
update public.civic_settings set lupon_enabled=true where singleton;
set local role authenticated;
select throws_ok($$select public.file_lupon_case('82000000-0000-4000-8000-000000000004','Party X','Party Y','Fictional street','Synthetic dispute details',false)$$,'22023','Verify the filing details and eligibility','Must attest eligibility');
select lives_ok($$select public.file_lupon_case('82000000-0000-4000-8000-000000000004','Party X','Party Y','Fictional street','Synthetic dispute details',true)$$,'Eligible open peace request enters mediation');
select throws_ok($$select public.change_lupon_case(id,'close','{"outcome":"cfa","notes":"Premature certificate"}') from public.lupon_cases where request_id='82000000-0000-4000-8000-000000000004'$$,'22023','Certificate requirements not met','CFA cannot issue before a qualifying stage');
select is((select public.change_lupon_case(id,'schedule',jsonb_build_object('at',now())) from public.lupon_cases where request_id='82000000-0000-4000-8000-000000000004'),'mediation','Staff can schedule a mediation hearing');
select throws_ok($$select public.change_lupon_case(k.id,'record',jsonb_build_object('hearing',h.id,'result','respondent_absent')) from public.lupon_cases k join public.lupon_hearings h on h.case_id=k.id where k.request_id='82000000-0000-4000-8000-000000000004'$$,'22023','Record service of summons before using nonappearance','Nonappearance requires serving a summons');
select is((select public.change_lupon_case(k.id,'served',jsonb_build_object('hearing',h.id)) from public.lupon_cases k join public.lupon_hearings h on h.case_id=k.id where k.request_id='82000000-0000-4000-8000-000000000004'),'mediation','Serving does not close the proceeding');
select is((select public.change_lupon_case(k.id,'record',jsonb_build_object('hearing',h.id,'result','respondent_absent','notes','Procedure note')) from public.lupon_cases k join public.lupon_hearings h on h.case_id=k.id where k.request_id='82000000-0000-4000-8000-000000000004'),'mediation','Served hearing can record nonappearance');
select is((select public.change_lupon_case(id,'close','{"outcome":"cfa","notes":"Synthetic official review"}') from public.lupon_cases where request_id='82000000-0000-4000-8000-000000000004'),'cfa','Qualifying nonappearance permits CFA');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000003","session_id":"81000000-0000-4000-8000-000000000003","aal":"aal2","amr":[{"method":"password"}]}';
select is((select count(*) from public.lupon_cases where request_id='82000000-0000-4000-8000-000000000004'),0::bigint,'Other team cannot see Lupon identities or address');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001","aal":"aal1","amr":[{"method":"otp"}]}';
select ok((select outcome like '%Certificate%' and outcome not like '%Synthetic official review%' from public.service_requests where ref='SYNTHETIC-OPS-4'),'Resident sees verdict but not procedural notes');
select is((select count(*) from public.incidents where title='Synthetic flood'),0::bigint,'Resident cannot inspect incident staff metadata');
reset role;
select ok(exists(select 1 from tugon_private.case_legal_holds where request_id='82000000-0000-4000-8000-000000000004'),'Closed Lupon records remain held');
select * from finish();
rollback;
