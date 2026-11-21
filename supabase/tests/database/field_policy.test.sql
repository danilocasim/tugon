begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('91000000-0000-4000-8000-000000000001','field-policy@example.test',now(),null,null),
 ('91000000-0000-4000-8000-000000000002',null,null,'639000000094',now()),
 ('91000000-0000-4000-8000-000000000003',null,null,'639000000095',now());
insert into auth.sessions(id,user_id,created_at,updated_at) select ('92000000-0000-4000-8000-00000000000'||i)::uuid,('91000000-0000-4000-8000-00000000000'||i)::uuid,now(),now() from generate_series(1,3) i;
insert into public.memberships(user_id,role,name,zone,phone) values
 ('91000000-0000-4000-8000-000000000001','supervisor','Field policy supervisor',null,null),
 ('91000000-0000-4000-8000-000000000002','tanod','Assigned synthetic officer','P2','+639000000094'),
 ('91000000-0000-4000-8000-000000000003','tanod','Other synthetic officer','P2','+639000000095');
insert into public.service_requests(id,ref,channel,description,category,status) values
 ('93000000-0000-4000-8000-000000000001','TGN-FIELD-POLICY','walkin','Synthetic field assignment','infra','in_progress');
insert into public.field_assignments(id,request_id,tanod_id,sent_by,status) values
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','on_scene');
insert into storage.objects(bucket_id,name) values('report-evidence','field/94000000-0000-4000-8000-000000000001.jpg');
set local role authenticated;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000003","session_id":"92000000-0000-4000-8000-000000000003","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select count(*) from public.field_assignments where id='94000000-0000-4000-8000-000000000001'),0::bigint,'Unrelated officer cannot see the assignment row');
select is((select count(*) from public.my_field_cases()),0::bigint,'Unrelated officer cannot read linked case text');
select is((select count(*) from storage.objects where bucket_id='report-evidence' and name='field/94000000-0000-4000-8000-000000000001.jpg'),0::bigint,'Unrelated officer cannot fetch the evidence object directly');
select throws_ok($$select public.change_field_assignment('94000000-0000-4000-8000-000000000001','report','Synthetic field completion','settled',true)$$,'42501','Assignment unavailable','Unrelated officer cannot publish a report');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.change_field_assignment('94000000-0000-4000-8000-000000000001','cancel','Supervisor called off the assignment')$$,'Staff cancels an open assignment');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000002","session_id":"92000000-0000-4000-8000-000000000002","aal":"aal1","amr":[{"method":"otp"}]}';
select throws_ok($$select public.change_field_assignment('94000000-0000-4000-8000-000000000001','report','Synthetic field completion','settled',true)$$,'22023','Assignment is closed','Post-cancel submission cannot reopen or publish the upload');
select is((select status from public.field_assignments where id='94000000-0000-4000-8000-000000000001'),'cancelled','Cancel is durable after failed submission');
select is((select has_photo from public.field_assignments where id='94000000-0000-4000-8000-000000000001'),false,'Object never becomes field proof');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001","aal":"aal2","amr":[{"method":"password"}]}';
select throws_ok($$select public.publish_case_resolution('93000000-0000-4000-8000-000000000001','The desk cannot publish this unapproved proof.',p_field=>'94000000-0000-4000-8000-000000000001')$$,'22023','Field proof is not available for this case','Even the desk cannot reuse a cancelled assignment upload');
reset role;
select * from finish();
rollback;
