begin;
-- Roster edits and dispatches hold a shared lock on the officer before writing.
-- Offboarding takes the exclusive membership lock before touching cases.
create or replace function public.change_officer_duty(p_officer uuid,p_date date,p_shift text,p_on boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor','admin') then raise exception 'Roster editor required' using errcode='42501'; end if;
  if p_date is null or p_date not between (now() at time zone 'Asia/Manila')::date - 1 and (now() at time zone 'Asia/Manila')::date + 366
    or p_shift is null or p_shift not in ('day','night') or p_on is null or not exists (
      select 1 from public.memberships m where m.user_id=p_officer and m.role='tanod' and m.active for share
    ) then raise exception 'Invalid duty shift' using errcode='22023'; end if;
  if p_on then
    insert into public.duty_roster(officer_id,local_date,shift) values(p_officer,p_date,p_shift) on conflict do nothing;
  else
    delete from public.duty_roster where officer_id=p_officer and local_date=p_date and shift=p_shift;
  end if;
  if found then
    insert into tugon_private.audit_log(actor_id,action,target_id,details)
      values(auth.uid(),case when p_on then 'duty_added' else 'duty_removed' end,p_officer,jsonb_build_object('date',p_date,'shift',p_shift));
  end if;
end;
$$;

create or replace function public.copy_duty_week(p_monday date) returns integer
language plpgsql security definer set search_path='' as $$
declare amount integer; today date := (now() at time zone 'Asia/Manila')::date;
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor','admin') then raise exception 'Roster editor required' using errcode='42501'; end if;
  if p_monday is null or extract(isodow from p_monday)<>1 or p_monday + 6 < today or p_monday + 6 > today + 366 then
    raise exception 'Invalid target week' using errcode='22023';
  end if;
  insert into public.duty_roster(officer_id,local_date,shift)
  select r.officer_id,r.local_date+7,r.shift from public.duty_roster r
  join public.memberships m on m.user_id=r.officer_id and m.role='tanod' and m.active
  where r.local_date between p_monday-7 and p_monday-1 and r.local_date+7>=today-1
  order by m.user_id,r.local_date,r.shift for share of m
  on conflict do nothing;
  get diagnostics amount = row_count;
  if amount>0 then
    insert into tugon_private.audit_log(actor_id,action,details) values(auth.uid(),'duty_week_copied',jsonb_build_object('week',p_monday,'shifts',amount));
  end if;
  return amount;
end;
$$;

create or replace function public.dispatch_tanod(p_id uuid,p_officer uuid,p_instructions text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); desk_role text := tugon_private.desk_role(); req public.service_requests%rowtype; assignment uuid;
begin
  if desk_role not in ('supervisor','handler','intake') or not tugon_private.staff_case_allowed(p_id) then raise exception 'Dispatch unavailable' using errcode='42501'; end if;
  perform 1 from public.memberships m where m.user_id=p_officer and m.active and m.role='tanod' for share;
  if not found then raise exception 'Choose an officer currently on duty' using errcode='22023'; end if;
  select * into req from public.service_requests where id=p_id for update;
  if not found or not tugon_private.staff_case_allowed(p_id)
    or req.status not in ('received','review','needs_info','queued','in_progress')
    or (desk_role='intake' and (not req.danger_now or req.status not in ('received','review','needs_info')))
    or (desk_role='handler' and req.status not in ('queued','in_progress')) then raise exception 'Dispatch unavailable' using errcode='42501'; end if;
  if coalesce(char_length(p_instructions),0)>1000 or not exists (
    select 1 from public.duty_roster d join tugon_private.current_shift() s on s.local_date=d.local_date and s.shift=d.shift
    where d.officer_id=p_officer
  ) then raise exception 'Choose an officer currently on duty' using errcode='22023'; end if;
  insert into public.field_assignments(request_id,tanod_id,sent_by,instructions) values(p_id,p_officer,actor,left(trim(coalesce(p_instructions,'')),1000)) returning id into assignment;
  insert into public.internal_case_events(request_id,actor_id,actor_name,event_type) select p_id,actor,m.name,'tanod_assigned' from public.memberships m where m.user_id=actor;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(actor,'tanod_dispatched',assignment);
  return assignment;
end;
$$;

create or replace function public.set_officer_active(p_officer uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); reason constant text := 'Tanod account deactivated';
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor','admin') then raise exception 'Roster editor required' using errcode='42501'; end if;
  if p_active is null then raise exception 'Specify whether the officer is active' using errcode='22023'; end if;
  update public.memberships set active=p_active where user_id=p_officer and role='tanod' and active<>p_active;
  if not found then return; end if;
  if not p_active then
    delete from auth.sessions where user_id=p_officer;
    delete from public.duty_roster where officer_id=p_officer and local_date>=(now() at time zone 'Asia/Manila')::date;
    with affected as materialized (
      select r.id from public.service_requests r where exists (
        select 1 from public.field_assignments a where a.request_id=r.id and a.tanod_id=p_officer and a.status in ('assigned','accepted','on_scene')
      ) order by r.id for update
    ), released as (
      update public.field_assignments a set status='cancelled',closed_at=now(),close_reason=reason
      from affected r where a.request_id=r.id and a.tanod_id=p_officer and a.status in ('assigned','accepted','on_scene') returning a.request_id
    )
    insert into public.internal_case_events(request_id,actor_id,actor_name,event_type,message)
      select r.request_id,actor,m.name,'tanod_cancelled',reason from released r join public.memberships m on m.user_id=actor;
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(actor,case when p_active then 'officer_reinstated' else 'officer_deactivated' end,p_officer);
end;
$$;
commit;
