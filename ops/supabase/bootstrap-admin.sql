\set ON_ERROR_STOP on
-- Run once from an approved operator connection after the work email has been verified by Auth.
-- Required psql variables: email, name. No credentials or personal values belong in this file.
begin;
select pg_advisory_xact_lock(hashtext('tugon:admin-bootstrap'));
with eligible as (
  select u.id
  from auth.users u
  where lower(u.email) = lower(:'email') and u.email_confirmed_at is not null
    and not exists (select 1 from public.memberships m where m.role = 'admin')
), added as (
  insert into public.memberships(user_id, role, name, title)
  select id, 'admin', trim(:'name'), 'Administrator' from eligible
  where char_length(trim(:'name')) between 2 and 100
  on conflict (user_id) do nothing
  returning user_id
)
insert into tugon_private.audit_log(action, target_id)
select 'bootstrap_admin', user_id from added;
\if :ROW_COUNT
commit;
\else
rollback;
do $$ begin
  raise exception 'No admin created: verify the work email, name, absence of a membership, and one-time bootstrap eligibility.';
end $$;
\endif
