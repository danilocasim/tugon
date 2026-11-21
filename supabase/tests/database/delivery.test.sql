begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('88000000-0000-4000-8000-000000000001','delivery-pilot@example.test',now(),null,null),
 ('88000000-0000-4000-8000-000000000002',null,null,'639000000097',now());
insert into public.memberships(user_id,name,role,phone,zone) values
 ('88000000-0000-4000-8000-000000000001','Synthetic Recipient','resident','+639000000098',null),
 ('88000000-0000-4000-8000-000000000002','Synthetic Officer','tanod','+639000000097','P2');
insert into public.resident_profiles(user_id,purok,lang,notice_version,email_updates,sms_updates,sms_opted_in_at)
values('88000000-0000-4000-8000-000000000001','P2','en','test',true,true,now());
insert into public.service_requests(id,ref,channel,resident_id,description) values('89000000-0000-4000-8000-000000000001','SYNTHETIC-DELIVERY','online','88000000-0000-4000-8000-000000000001','Synthetic delivery fixture');
insert into public.resident_notifications(id,resident_id,request_id,kind) values
 ('89500000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','receipt');
-- Give these two entries priority over persistent local browser fixtures without touching those records.
update tugon_private.delivery_outbox set available_at='2000-01-01T00:00Z' where event_key='89500000-0000-4000-8000-000000000001';
select is((select count(*) from tugon_private.delivery_outbox where event_key='89500000-0000-4000-8000-000000000001'),2::bigint,'Opt-in queues one job for each channel');
select is((select channel from public.lease_one_delivery(array['email'])),'email','Worker does not lease a paused SMS channel');
select lives_ok($$select public.finish_delivery(id,attempt,'throttled') from tugon_private.delivery_outbox where event_key='89500000-0000-4000-8000-000000000001' and channel='email'$$,'429 records a retry');
select ok((select state='pending' and available_at>now() from tugon_private.delivery_outbox where event_key='89500000-0000-4000-8000-000000000001' and channel='email'),'Retry timing survives a worker restart');
update public.resident_profiles set sms_updates=false,sms_opted_in_at=null where user_id='88000000-0000-4000-8000-000000000001';
select lives_ok($$select public.lease_one_delivery(array['sms'])$$,'Worker rechecks consent immediately before provider handoff');
select is((select state from tugon_private.delivery_outbox where event_key='89500000-0000-4000-8000-000000000001' and channel='sms'),'suppressed','Opted-out pending SMS is not sent');
update tugon_private.delivery_outbox set state='sending',leased_at=now()-interval '4 minutes' where event_key='89500000-0000-4000-8000-000000000001' and channel='email';
select lives_ok($$select public.lease_one_delivery(array[]::text[])$$,'A poll reconciles abandoned leases');
select is((select state from tugon_private.delivery_outbox where event_key='89500000-0000-4000-8000-000000000001' and channel='email'),'unknown','Unknown result is never automatically retried');
select is(public.lease_sms_auth_hook('synthetic-signed-id','88000000-0000-4000-8000-000000000001','+639000000098'),'denied','Resident is not eligible for the officer OTP hook');
select is(public.lease_sms_auth_hook('synthetic-signed-id','88000000-0000-4000-8000-000000000002','+639000000097'),'leased','Active roster entry authorizes one invocation');
select is(public.lease_sms_auth_hook('synthetic-signed-id','88000000-0000-4000-8000-000000000002','+639000000097'),'unconfirmed','In-flight or interrupted delivery is not acknowledged or replayed');
select ok(public.accept_sms_auth_hook('synthetic-signed-id'),'A successful provider response can be acknowledged');
select is(public.lease_sms_auth_hook('synthetic-signed-id','88000000-0000-4000-8000-000000000002','+639000000097'),'accepted','Confirmed replay succeeds without invoking the provider twice');
select ok(not has_function_privilege('authenticated','public.accept_sms_auth_hook(text)','execute'),'A portal session cannot acknowledge a signed hook');
select ok(not has_function_privilege('authenticated','public.lease_one_delivery(text[])','execute'),'Authenticated portal sessions cannot lease provider jobs');
select * from finish();
rollback;
