\set ON_ERROR_STOP on
-- Invoke as the approved migration operator after DPO approval, with
-- -v erasure_id=<uuid> -v approved_by=<named administrator uuid>.
-- Approval does not activate retention or delete anything by itself.
begin;
with approval as (
  update tugon_private.erasure_requests e
  set approved_at=now(),approved_by=:'approved_by'::uuid
  where e.id=:'erasure_id'::uuid and e.approved_at is null and e.completed_at is null
    and exists(select 1 from public.memberships m where m.user_id=:'approved_by'::uuid and m.active and m.role='admin')
  returning e.id,e.approved_by
)
insert into tugon_private.audit_log(actor_id,action,target_id)
select approved_by,'erasure_approved',id from approval;
commit;
