begin;

create table public.field_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  tanod_id uuid not null references public.memberships(user_id),
  sent_by uuid not null references public.memberships(user_id),
  instructions text not null default '',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  closed_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','accepted','on_scene','done','declined','cancelled')),
  close_reason text,
  result text check (result in ('settled','follow_up','unfounded','turned_over')),
  report text,
  has_photo boolean not null default false
);
create unique index only_one_open_field_assignment on public.field_assignments(request_id,tanod_id) where status in ('assigned','accepted','on_scene');
create index field_assignments_officer on public.field_assignments(tanod_id,assigned_at desc);
alter table public.field_assignments enable row level security;
revoke all on public.field_assignments from public,anon,authenticated;
grant select on public.field_assignments to authenticated;
create policy owned_or_desk_field_assignment on public.field_assignments for select to authenticated using (
  tugon_private.staff_case_allowed(request_id) or (tanod_id=(select auth.uid()) and exists(
    select 1 from public.memberships m where m.user_id=field_assignments.tanod_id and m.role='tanod'
  ))
);

create function tugon_private.current_shift(at_time timestamptz default now())
returns table(local_date date,shift text) language sql stable set search_path='' as $$
   select (at_time at time zone 'Asia/Manila')::date - case when extract(hour from at_time at time zone 'Asia/Manila') < 6 then 1 else 0 end,
    case when extract(hour from at_time at time zone 'Asia/Manila') between 6 and 17 then 'day' else 'night' end;
$$;
revoke all on function tugon_private.current_shift(timestamptz) from public,anon,authenticated;

create function public.dispatch_tanod(p_id uuid,p_officer uuid,p_instructions text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); desk_role text := tugon_private.desk_role(); req public.service_requests%rowtype;
  assignment uuid;
begin
  if desk_role not in ('supervisor','handler','intake') or not tugon_private.staff_case_allowed(p_id) then raise exception 'Dispatch unavailable' using errcode='42501'; end if;
  select * into req from public.service_requests where id=p_id for update;
  if not found or not tugon_private.staff_case_allowed(p_id)
    or req.status not in ('received','review','needs_info','queued','in_progress')
    or (desk_role='intake' and (not req.danger_now or req.status not in ('received','review','needs_info')))
    or (desk_role='handler' and req.status not in ('queued','in_progress')) then raise exception 'Dispatch unavailable' using errcode='42501'; end if;
  if coalesce(char_length(p_instructions),0)>1000 or not exists (
    select 1 from public.duty_roster d join tugon_private.current_shift() s on s.local_date=d.local_date and s.shift=d.shift
    join public.memberships m on m.user_id=d.officer_id where m.user_id=p_officer and m.active and m.role='tanod'
  ) then raise exception 'Choose an officer currently on duty' using errcode='22023'; end if;
  insert into public.field_assignments(request_id,tanod_id,sent_by,instructions) values(p_id,p_officer,actor,left(trim(coalesce(p_instructions,'')),1000)) returning id into assignment;
  insert into public.internal_case_events(request_id,actor_id,actor_name,event_type) select p_id,actor,m.name,'tanod_assigned' from public.memberships m where m.user_id=actor;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(actor,'tanod_dispatched',assignment);
  return assignment;
end;
$$;
revoke all on function public.dispatch_tanod(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dispatch_tanod(uuid,uuid,text) to authenticated;

create function public.change_field_assignment(p_id uuid,p_action text,p_message text default '',p_result text default '',p_photo boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); desk_role text := tugon_private.desk_role();
  a public.field_assignments%rowtype; r public.service_requests%rowtype;
  case_id uuid; actor_name text; evt text; resident_evt text;
begin
  if not tugon_private.session_is_current() then raise exception 'Assignment unavailable' using errcode='42501'; end if;
  select request_id into case_id from public.field_assignments where id=p_id;
  select * into r from public.service_requests where id=case_id for update;
  select * into a from public.field_assignments where id=p_id for update;
  if not found then raise exception 'Assignment unavailable' using errcode='42501'; end if;
  select m.name into actor_name from public.memberships m where m.user_id=actor and m.active;
  if actor_name is null then raise exception 'Assignment unavailable' using errcode='42501'; end if;
  if p_action='cancel' then
    if not tugon_private.staff_case_allowed(case_id) or (desk_role <> 'supervisor' and a.sent_by <> actor and not exists(select 1 from public.case_work where request_id=case_id and assignee_id=actor)) then
      raise exception 'Assignment unavailable' using errcode='42501';
    end if;
  elsif a.tanod_id <> actor or not exists(select 1 from public.memberships m where m.user_id=actor and m.role='tanod' and m.active) then
    raise exception 'Assignment unavailable' using errcode='42501';
  end if;
  if a.status not in ('assigned','accepted','on_scene') or r.status not in ('received','review','needs_info','queued','in_progress') then raise exception 'Assignment is closed' using errcode='22023'; end if;
  if coalesce(char_length(p_message),0)>2000 then raise exception 'Report too long' using errcode='22023'; end if;
  case p_action
    when 'accept' then
      if a.status<>'assigned' then raise exception 'Expected a new assignment' using errcode='22023'; end if;
      a.status := 'accepted'; a.accepted_at := now(); evt := 'tanod_accepted'; resident_evt := evt;
    when 'arrive' then
      if a.status<>'accepted' then raise exception 'Accept before marking arrival' using errcode='22023'; end if;
      a.status := 'on_scene'; a.arrived_at := now(); evt := 'tanod_arrived'; resident_evt := evt;
    when 'decline','cancel' then
      if (p_action='decline' and a.status<>'assigned') or coalesce(char_length(trim(p_message)),0)<3 then raise exception 'Choose a reason for releasing the assignment' using errcode='22023'; end if;
      a.status := case when p_action='cancel' then 'cancelled' else 'declined' end; a.closed_at := now(); a.close_reason := trim(p_message);
      evt := 'tanod_'||a.status;
    when 'report' then
      if a.status<>'on_scene' or coalesce(char_length(trim(p_message)),0)<10 or p_result is null or p_result not in ('settled','follow_up','unfounded','turned_over') then raise exception 'Field report needs an outcome and details' using errcode='22023'; end if;
      if p_photo and not exists(select 1 from storage.objects o where o.bucket_id='report-evidence' and o.name='field/'||a.id::text||'.jpg') then raise exception 'Field photo missing' using errcode='22023'; end if;
      a.status := 'done'; a.closed_at := now(); a.result := p_result; a.report := trim(p_message); a.has_photo := coalesce(p_photo,false); evt := 'field_report';
    else raise exception 'Unknown field action' using errcode='22023';
  end case;
  update public.field_assignments set status=a.status,accepted_at=a.accepted_at,arrived_at=a.arrived_at,closed_at=a.closed_at,
    close_reason=a.close_reason,result=a.result,report=a.report,has_photo=a.has_photo where id=p_id;
  insert into public.internal_case_events(request_id,actor_id,actor_name,event_type) values(case_id,actor,actor_name,evt);
  if resident_evt is not null and r.resident_id is not null then
    insert into public.resident_request_events(request_id,event_type,author) values(case_id,resident_evt,'staff');
    if resident_evt='tanod_accepted' then insert into public.resident_notifications(request_id,resident_id,kind) values(case_id,r.resident_id,'tanod'); end if;
    update public.service_requests set updated_at=now() where id=case_id;
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(actor,evt,p_id);
end;
$$;
revoke all on function public.change_field_assignment(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.change_field_assignment(uuid,text,text,text,boolean) to authenticated;

create function public.my_field_cases()
returns table(assignment jsonb, linked_case jsonb, sender text) language sql stable security definer set search_path='' as $$
  select to_jsonb(a),jsonb_build_object('id',r.id,'ref',r.ref,'text',r.description,'category',coalesce(r.category,r.resident_category,w.prediction->>'category','peace'),
    'urgency',coalesce(w.urgency,w.prediction->>'urgency',case when r.danger_now then 'high' else 'normal' end),
    'dangerNow',r.danger_now,'restricted',coalesce(w.restricted,false),'location',r.location,'hasPhoto',r.has_photo and a.status in ('assigned','accepted','on_scene'),
    'createdAt',extract(epoch from r.created_at)*1000,'status',r.status,'reporterName',null,'teamName',r.team_name,'handlerName',handler.name),
    coalesce(s.name,'Barangay')
  from public.field_assignments a join public.service_requests r on r.id=a.request_id
  left join public.case_work w on w.request_id=r.id left join public.memberships handler on handler.user_id=w.assignee_id
  left join public.memberships s on s.user_id=a.sent_by
  where a.tanod_id=auth.uid() and (select tugon_private.session_is_current()) and exists(select 1 from public.memberships m where m.user_id=a.tanod_id and m.active and m.role='tanod')
    and (a.closed_at is null or a.closed_at>now()-interval '30 days')
  order by a.assigned_at desc,a.id;
$$;
revoke all on function public.my_field_cases() from public,anon,authenticated;
grant execute on function public.my_field_cases() to authenticated;

create function public.tanod_on_duty_partners()
returns table(id uuid,name text,phone text,zone text,shift text) language sql stable security definer set search_path='' as $$
  with slot as (select * from tugon_private.current_shift())
  select m.user_id,m.name,m.phone,m.zone,r.shift from slot s join public.duty_roster r on r.local_date=s.local_date and r.shift=s.shift
  join public.memberships m on m.user_id=r.officer_id and m.active and m.role='tanod'
  where (select tugon_private.session_is_current()) and exists (select 1 from public.duty_roster mine join public.memberships a on a.user_id=mine.officer_id and a.active and a.role='tanod'
    where mine.officer_id=auth.uid() and mine.local_date=s.local_date and mine.shift=s.shift);
$$;
revoke all on function public.tanod_on_duty_partners() from public,anon,authenticated;
grant execute on function public.tanod_on_duty_partners() to authenticated;

create function tugon_private.broadcast_field_change() returns trigger language plpgsql security definer set search_path='' as $$
declare work public.case_work%rowtype;
begin
  select * into work from public.case_work where request_id=new.request_id;
  perform realtime.send('{}'::jsonb,'changed','tugon:tanod:'||new.tanod_id::text,true);
  perform realtime.send('{}'::jsonb,'changed','tugon:staff:'||new.sent_by::text,true);
  perform realtime.send('{}'::jsonb,'changed','tugon:supervisors',true);
  if work.assignee_id is not null and work.assignee_id<>new.sent_by then perform realtime.send('{}'::jsonb,'changed','tugon:staff:'||work.assignee_id::text,true); end if;
  return null;
end;
$$;
create trigger field_changed after insert or update on public.field_assignments for each row execute function tugon_private.broadcast_field_change();

create function tugon_private.release_closed_case() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('resolved','referred','withdrawn','duplicate') and new.status is distinct from old.status then
    update public.field_assignments set status='cancelled',close_reason='Case closed',closed_at=now()
    where request_id=new.id and status in ('assigned','accepted','on_scene');
  end if;
  return null;
end;
$$;
create trigger release_field_on_case_closure after update of status on public.service_requests for each row execute function tugon_private.release_closed_case();

commit;
