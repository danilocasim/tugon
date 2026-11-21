begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000001', 'policy-resident@example.test', now()),
  ('10000000-0000-4000-8000-000000000002', 'policy-handler@example.test', now()),
  ('10000000-0000-4000-8000-000000000003', 'policy-disabled@example.test', now());
insert into auth.sessions(id, user_id, created_at, updated_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', now(), now()),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', now(), now());
insert into public.memberships(user_id, role, active, name, team_id) values
  ('10000000-0000-4000-8000-000000000002', 'handler', true, 'Handler', 't_works'),
  ('10000000-0000-4000-8000-000000000003', 'resident', false, 'Disabled resident', null);

set local role anon;
select throws_ok('select user_id from public.memberships', '42501', null, 'Anonymous membership access is blocked');
select is((select count(*) from public.civic_settings), 1::bigint, 'Public barangay settings are available to guests');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","aal":"aal1","role":"authenticated"}';
select throws_ok($$select public.complete_resident_profile('Resident', 'P1', 'fil', false)$$, '22023', 'Invalid profile details', 'Onboarding requires notice acknowledgement');
select lives_ok($$select public.complete_resident_profile('Resident', 'P1', 'fil', true)$$, 'Verified resident can create their own profile');
select is((select count(*) from public.memberships), 1::bigint, 'Only the signed-in identity is visible');
select is((select lang from public.resident_profiles), 'fil', 'Profile settings are visible to their owner');
select throws_ok($$update public.memberships set role = 'admin'$$, '42501', null, 'Resident cannot promote their role');
select throws_ok($$update public.resident_profiles set notice_version = 'other'$$, '42501', null, 'Resident cannot rewrite recorded consent');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","aal":"aal1","role":"authenticated"}';
select is((select count(*) from public.teams), 0::bigint, 'Password-only staff cannot read team data');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","aal":"aal2","role":"authenticated"}';
select is((select count(*) from public.teams where category is not null), 5::bigint, 'Second factor unlocks the configured category teams');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","aal":"aal1","role":"authenticated"}';
select is((select count(*) from public.memberships), 0::bigint, 'Disabled membership denies a still-valid session');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000099","aal":"aal1","role":"authenticated"}';
select is((select count(*) from public.memberships), 0::bigint, 'An expired or revoked session cannot read membership');

reset role;
select * from finish();
rollback;
