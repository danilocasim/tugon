begin;

alter table public.teams add column category text unique check (category in ('peace','infra','sanitation','documents','social'));
update public.teams set category = case id when 't_peace' then 'peace' when 't_works' then 'infra' when 't_health' then 'sanitation' when 't_records' then 'documents' when 't_social' then 'social' end;
create table public.case_work (
  request_id uuid primary key references public.service_requests(id) on delete cascade,
  team_id text references public.teams(id),
  assignee_id uuid references public.memberships(user_id) on delete set null,
  restricted boolean not null default false,
  prediction jsonb,
  model_version text,
  urgency text check(urgency in ('high','medium','normal')),
  triaged_at timestamptz,
  triaged_by uuid,
  override_reason text,
  first_action_at timestamptz,
  started_at timestamptz,
  duplicate_of uuid references public.service_requests(id) on delete set null
);
create index case_work_team_assignee on public.case_work(team_id,assignee_id);
create table public.internal_case_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid not null,
  actor_name text not null,
  event_type text not null,
  message text,
  created_at timestamptz not null default now()
);
create index internal_events_request_at on public.internal_case_events(request_id,created_at,id);
alter table public.case_work enable row level security;
alter table public.internal_case_events enable row level security;
revoke all on public.case_work,public.internal_case_events from public,anon,authenticated;
grant select on public.case_work,public.internal_case_events to authenticated;

create function tugon_private.staff_case_allowed(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.service_requests r left join public.case_work w on w.request_id=r.id
    join public.memberships m on m.user_id=(select auth.uid())
    where r.id=p_id and (select tugon_private.desk_role()) in ('handler','intake','supervisor')
      and (m.role='supervisor' or w.assignee_id=m.user_id or (
        case when coalesce(w.restricted,false) then m.role='intake' and r.status in ('received','review','needs_info')
        else m.role='intake' or (m.role='handler' and w.team_id=m.team_id) end)));
$$;
revoke all on function tugon_private.staff_case_allowed(uuid) from public,anon,authenticated;
grant execute on function tugon_private.staff_case_allowed(uuid) to authenticated;
create policy desk_case_read on public.service_requests for select to authenticated using (tugon_private.staff_case_allowed(id));
create policy desk_case_work_read on public.case_work for select to authenticated using (tugon_private.staff_case_allowed(request_id));
create policy desk_case_notes_read on public.internal_case_events for select to authenticated using (tugon_private.staff_case_allowed(request_id));
create policy desk_handlers_read on public.memberships for select to authenticated using (role='handler' and (select tugon_private.desk_role())='supervisor');

create function public.save_case_prediction(p_case uuid,p_prediction jsonb,p_version text)
returns void language sql security definer set search_path = '' as $$
  insert into public.case_work(request_id,prediction,model_version) values(p_case,p_prediction,p_version)
  on conflict(request_id) do update set prediction=excluded.prediction,model_version=excluded.model_version
  where case_work.prediction is null;
$$;
revoke all on function public.save_case_prediction(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_case_prediction(uuid,jsonb,text) to service_role;

create function public.change_case(p_id uuid,p_action text,p_input jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor public.memberships%rowtype;
  role text := tugon_private.desk_role();
  req public.service_requests%rowtype;
  work public.case_work%rowtype;
  intake boolean;
  working boolean;
  owner_or_supervisor boolean;
  msg text := nullif(trim(p_input->>'message'),'');
  reason text := nullif(trim(p_input->>'reason'),'');
  cat text := p_input->>'category';
  urgency text := p_input->>'urgency';
  team public.teams%rowtype;
  target uuid;
  target_case public.service_requests%rowtype;
  old_team text;
  is_restricted boolean;
  event_name text;
  notification text;
  is_internal boolean := false;
  photo_key text;
begin
  if role is null or role='admin' or not tugon_private.staff_case_allowed(p_id) then
    raise exception 'Case unavailable' using errcode='42501';
  end if;
  select * into actor from public.memberships where user_id=auth.uid();
  select * into req from public.service_requests where id=p_id for update;
  if not found or not tugon_private.staff_case_allowed(p_id) then raise exception 'Case unavailable' using errcode='42501'; end if;
  insert into public.case_work(request_id) values(p_id) on conflict do nothing;
  select * into work from public.case_work where request_id=p_id for update;
  intake := role in ('intake','supervisor') and req.status in ('received','review','needs_info');
  working := req.status in ('queued','in_progress');
  owner_or_supervisor := coalesce(work.assignee_id=actor.user_id,false) or role='supervisor';
  if coalesce(char_length(msg),0)>2000 or coalesce(char_length(reason),0)>1000 then raise exception 'Message is too long' using errcode='22023'; end if;
  case p_action
    when 'review' then
      if not intake or req.status <> 'received' then raise exception 'Review unavailable' using errcode='22023'; end if;
      req.status := 'review'; work.first_action_at := coalesce(work.first_action_at,now());
      event_name := 'review_started'; notification := event_name;
    when 'ask' then
      if not intake or req.status='needs_info' or coalesce(char_length(msg),0)<5 then raise exception 'Question unavailable' using errcode='22023'; end if;
      req.status := 'needs_info'; work.first_action_at := coalesce(work.first_action_at,now());
      event_name := 'info_requested'; notification := event_name;
    when 'triage','retriage' then
      if (p_action='triage' and not intake) or (p_action='retriage' and (not working or role not in ('intake','supervisor') or reason is null))
         or cat is null or urgency is null or urgency not in ('high','medium','normal') or work.prediction is null then
        raise exception 'Triage unavailable' using errcode='22023'; end if;
      select * into team from public.teams where category=cat;
      if not found then raise exception 'No team for category' using errcode='22023'; end if;
      if (cat is distinct from work.prediction->>'category' or urgency is distinct from work.prediction->>'urgency') and reason is null then
        raise exception 'An override reason is required' using errcode='22023'; end if;
      is_restricted := work.restricted or coalesce((p_input->>'restricted')::boolean,false);
      old_team := work.team_id;
      work.team_id := team.id; work.urgency := urgency; work.triaged_at := now(); work.triaged_by := actor.user_id;
      work.restricted := is_restricted; work.override_reason := reason;
      work.first_action_at := coalesce(work.first_action_at,now());
      req.category := cat; req.team_name := team.name;
      if p_action='triage' or old_team is distinct from team.id then
        req.status := 'queued'; work.assignee_id := null; work.started_at := null;
      end if;
      event_name := 'triaged'; notification := 'queued'; msg := null;
    when 'claim' then
      if req.status<>'queued' or work.assignee_id is not null or (role<>'supervisor' and (role<>'handler' or work.team_id is distinct from actor.team_id))
        then raise exception 'Claim unavailable' using errcode='22023'; end if;
      work.assignee_id := actor.user_id; event_name := 'assigned'; is_internal := true; msg := reason;
    when 'assign' then
      if not working or role<>'supervisor' or reason is null then raise exception 'Assignment unavailable' using errcode='22023'; end if;
      target := (p_input->>'assignee')::uuid;
      if not exists(select 1 from public.memberships m where m.user_id=target and m.active and ((m.role='handler' and m.team_id=work.team_id) or m.role='supervisor')) then
        raise exception 'Assignee cannot work on this case' using errcode='22023'; end if;
      work.assignee_id := target; event_name := 'assigned'; is_internal := true; msg := reason;
    when 'start' then
      if req.status<>'queued' or not owner_or_supervisor then raise exception 'Start unavailable' using errcode='22023'; end if;
      work.assignee_id := coalesce(work.assignee_id,actor.user_id); work.started_at := now(); req.status := 'in_progress';
      event_name := 'started'; notification := event_name;
    when 'note','update' then
      if coalesce(char_length(msg),0)<3 or (p_action='update' and (not working or not owner_or_supervisor)) then
        raise exception 'Update unavailable' using errcode='22023'; end if;
      event_name := p_action; is_internal := p_action='note'; notification := case when p_action='update' then event_name end;
    when 'resolve' then
      if req.status<>'in_progress' or not owner_or_supervisor or coalesce(char_length(msg),0)<10 then
        raise exception 'Resolution unavailable' using errcode='22023'; end if;
      photo_key := concat(req.id,'/outcome.jpg');
      req.outcome_photo := coalesce((p_input->>'photo')::boolean,false);
      if req.outcome_photo and not exists(select 1 from storage.objects o where o.bucket_id='report-evidence' and o.name=photo_key) then
        raise exception 'Outcome photo missing' using errcode='22023'; end if;
      req.status := 'resolved'; req.outcome := msg; req.closed_at := now(); req.follow_up := false;
      event_name := 'resolved'; notification := event_name;
    when 'reopen' then
      if role<>'supervisor' or req.status not in ('resolved','referred') or reason is null then raise exception 'Reopen unavailable' using errcode='22023'; end if;
      req.status := case when work.team_id is null then 'review' else 'queued' end;
      req.closed_at := null; req.outcome := null; req.outcome_photo := false; req.referral_office := null; req.follow_up := false; work.started_at := null;
      event_name := 'reopened'; notification := event_name; msg := null;
    when 'refer' then
      if not (intake or (working and owner_or_supervisor)) or coalesce(char_length(msg),0)<5
        or not exists(select 1 from public.referral_offices o where o.name=trim(p_input->>'office')) then
        raise exception 'Referral unavailable' using errcode='22023'; end if;
      req.referral_office := trim(p_input->>'office'); req.status := 'referred'; req.closed_at := now(); work.first_action_at := coalesce(work.first_action_at,now());
      event_name := 'referred'; notification := event_name;
    when 'duplicate' then
      target := (p_input->>'original')::uuid;
      if not intake or target is null or target=p_id or not tugon_private.staff_case_allowed(target) then raise exception 'Duplicate unavailable' using errcode='22023'; end if;
      select * into target_case from public.service_requests where id=target and status not in ('duplicate','withdrawn');
      if not found then raise exception 'Original unavailable' using errcode='22023'; end if;
      req.status := 'duplicate'; req.closed_at := now(); work.duplicate_of := target; work.first_action_at := coalesce(work.first_action_at,now());
      req.duplicate_of_ref := case when target_case.resident_id=req.resident_id then target_case.ref end;
      event_name := 'duplicate'; notification := event_name;
    when 'restricted' then
      if role<>'supervisor' or reason is null or jsonb_typeof(p_input->'restricted') is distinct from 'boolean' then raise exception 'Restricted status unavailable' using errcode='22023'; end if;
      work.restricted := (p_input->>'restricted')::boolean; event_name := 'note'; is_internal := true; msg := reason;
    else raise exception 'Invalid case action' using errcode='22023';
  end case;
  update public.case_work set team_id=work.team_id,assignee_id=work.assignee_id,restricted=work.restricted,urgency=work.urgency,
    triaged_at=work.triaged_at,triaged_by=work.triaged_by,override_reason=work.override_reason,first_action_at=work.first_action_at,
    started_at=work.started_at,duplicate_of=work.duplicate_of where request_id=p_id;
  update public.service_requests set status=req.status, category=req.category,team_name=req.team_name,referral_office=req.referral_office,
    duplicate_of_ref=req.duplicate_of_ref,outcome=req.outcome,outcome_photo=req.outcome_photo,follow_up=req.follow_up,closed_at=req.closed_at,
    updated_at=case when is_internal then updated_at else now() end where id=p_id;
  if is_internal then
    insert into public.internal_case_events(request_id,actor_id,actor_name,event_type,message) values(p_id,actor.user_id,actor.name,event_name,msg);
  else
    insert into public.resident_request_events(request_id,event_type,author,message) values(p_id,event_name,'staff',msg);
    if notification is not null and req.resident_id is not null then
      insert into public.resident_notifications(request_id,resident_id,kind) values(p_id,req.resident_id,notification);
    end if;
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id,details) values(actor.user_id,p_action,p_id,jsonb_build_object('status',req.status,'team',work.team_id));
end;
$$;
revoke all on function public.change_case(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.change_case(uuid,text,jsonb) to authenticated;

commit;
