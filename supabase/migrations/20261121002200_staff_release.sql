begin;
create or replace function public.staff_admin_change(p_user uuid,p_active boolean,p_role text default null,p_team text default null)
returns void language plpgsql security definer set search_path='' as $$
declare former public.memberships%rowtype; revised public.memberships%rowtype; actor_name text;
begin
  if (select tugon_private.desk_role()) is distinct from 'admin' or p_user=auth.uid() then raise exception 'Admin required; cannot change your own role here' using errcode='42501'; end if;
  if p_role is not null and (p_role not in ('intake','handler','supervisor','admin') or (p_role='handler' and not exists(select 1 from public.teams t where t.id=p_team and t.category is not null))) then raise exception 'Invalid staff role' using errcode='22023'; end if;
  select * into former from public.memberships where user_id=p_user and role in ('intake','handler','supervisor','admin') for update;
  if not found then raise exception 'Staff member unavailable' using errcode='22023'; end if;
  update public.memberships set active=coalesce(p_active,active),role=coalesce(p_role,role),title=coalesce(initcap(p_role),title),
    team_id=case when p_role is null then team_id when p_role='handler' then p_team end where user_id=p_user returning * into revised;
  if not revised.active or revised.role is distinct from former.role or revised.team_id is distinct from former.team_id then
    delete from auth.sessions where user_id=p_user;
    select m.name into actor_name from public.memberships m where m.user_id=auth.uid();
    with affected as materialized (
      select r.id from public.service_requests r join public.case_work w on w.request_id=r.id
      where w.assignee_id=p_user and r.status in ('queued','in_progress') order by r.id for update of r
    ), released as (
      update public.case_work w set assignee_id=null,started_at=null from affected a where w.request_id=a.id and w.assignee_id=p_user returning w.request_id
    ), changed as (
      update public.service_requests r set status=case when exists(select 1 from public.lupon_cases k where k.request_id=r.id and k.closed_at is null) then r.status else 'queued' end,updated_at=now()
      from released l where r.id=l.request_id returning r.id
    )
    insert into public.internal_case_events(request_id,actor_id,actor_name,event_type,message)
      select id,auth.uid(),actor_name,'assigned','Released after a staff access change.' from changed;
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id,details)
    values(auth.uid(),'staff_membership_changed',p_user,jsonb_build_object('role',p_role,'active',p_active,'team',p_team));
end;
$$;

create or replace function public.admin_retention_preview()
returns table(eligible bigint,held bigint,erasure_pending bigint)
language sql stable security definer set search_path='' as $$
  select (select count(*) from public.service_requests r join public.civic_settings c on c.singleton
    where r.anonymized_at is null and r.status in ('resolved','referred','duplicate','withdrawn') and r.closed_at < now()-make_interval(months=>c.retention_months)
    and not exists(select 1 from tugon_private.case_legal_holds h where h.request_id=r.id)),
    (select count(*) from tugon_private.case_legal_holds), (select count(*) from tugon_private.erasure_requests where completed_at is null)
  where (select tugon_private.desk_role())='admin';
$$;
commit;
