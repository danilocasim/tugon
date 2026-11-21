begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
insert into auth.users(id,email,email_confirmed_at,phone) values
 ('95000000-0000-4000-8000-000000000001','offboarding-supervisor@example.test',now(),null),
 ('95000000-0000-4000-8000-000000000002',null,null,'+639000000092');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',now(),now()),
 ('95100000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002',now(),now());
insert into public.memberships(user_id,role,name) values('95000000-0000-4000-8000-000000000001','supervisor','Offboarding Fixture Supervisor');
select lives_ok($$select public.register_officer('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','Offboarding Fixture Officer','+639000000092','P2')$$,'Verified supervisor provisioning accepts an E.164 Auth phone');
insert into public.duty_roster(officer_id,local_date,shift)
select '95000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Manila')::date + delta,shift
from (values (-14,'day'),(-7,'night'),(0,'day'),(1,'day')) d(delta,shift);
insert into public.service_requests(id,ref,channel,description,category,status)
values('95200000-0000-4000-8000-000000000001','TGN-SYNTH-OFFBOARD','walkin','Synthetic offboarding assignment','infra','in_progress');
insert into public.field_assignments(id,request_id,tanod_id,sent_by,status,closed_at) values
 ('95300000-0000-4000-8000-000000000001','95200000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','on_scene',null),
 ('95300000-0000-4000-8000-000000000002','95200000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','done',now());

set local role authenticated;
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000002","session_id":"95100000-0000-4000-8000-000000000002","aal":"aal1","amr":[{"method":"otp"}]}';
select throws_ok($$select public.set_officer_active('95000000-0000-4000-8000-000000000002',false)$$,'42501','Roster editor required','An officer cannot change their own access');
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000001","session_id":"95100000-0000-4000-8000-000000000001","aal":"aal2","amr":[{"method":"password"}]}';
select lives_ok($$select public.copy_duty_week(date_trunc('week',now() at time zone 'Asia/Manila')::date)$$,'The supervisor can still copy the duty week');
select is((select count(*) from public.duty_roster where officer_id='95000000-0000-4000-8000-000000000002' and local_date=(now() at time zone 'Asia/Manila')::date and shift='night'),1::bigint,'The previous week supplies the expected active slot');
select lives_ok($$select public.set_officer_active('95000000-0000-4000-8000-000000000002',false)$$,'Supervisor can offboard an officer');
select is((select count(*) from public.duty_roster where officer_id='95000000-0000-4000-8000-000000000002' and local_date>=(now() at time zone 'Asia/Manila')::date),0::bigint,'Today and future slots are removed');
select is((select count(*) from public.duty_roster where officer_id='95000000-0000-4000-8000-000000000002'),2::bigint,'Earlier roster history is preserved');
select ok((select status='cancelled' and closed_at is not null and close_reason='Tanod account deactivated' from public.field_assignments where id='95300000-0000-4000-8000-000000000001'),'An open assignment is durably released with a reason');
select is((select status from public.field_assignments where id='95300000-0000-4000-8000-000000000002'),'done','Completed field work stays in the record');
select throws_ok($$select public.dispatch_tanod('95200000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002')$$,'22023','Choose an officer currently on duty','Inactive officer is not dispatchable');
select throws_ok($$select public.change_officer_duty('95000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Manila')::date,'day',true)$$,'22023','Invalid duty shift','Inactive officer cannot be rostered again');
select lives_ok($$select public.set_officer_active('95000000-0000-4000-8000-000000000002',false)$$,'A repeated deactivation is safe');
select is((select count(*) from public.internal_case_events where request_id='95200000-0000-4000-8000-000000000001' and event_type='tanod_cancelled'),1::bigint,'Staff see one release event even after retry');
select lives_ok($$select public.set_officer_active('95000000-0000-4000-8000-000000000002',true)$$,'Supervisor can restore access');
select is((select count(*) from public.duty_roster where officer_id='95000000-0000-4000-8000-000000000002' and local_date>=(now() at time zone 'Asia/Manila')::date),0::bigint,'Reactivation does not silently restore prior coverage');
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000002","session_id":"95100000-0000-4000-8000-000000000002","aal":"aal1","amr":[{"method":"otp"}]}';
select is((select count(*) from public.field_assignments where request_id='95200000-0000-4000-8000-000000000001'),0::bigint,'The previously issued session remains revoked after reactivation');

reset role;
select * from finish();
rollback;
