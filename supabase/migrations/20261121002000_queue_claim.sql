begin;
alter function public.change_case(uuid,text,jsonb) set schema tugon_private;
revoke all on function tugon_private.change_case(uuid,text,jsonb) from public,anon,authenticated;
create function tugon_private.priority_score(p_category text,p_urgency text,p_created timestamptz,p_now timestamptz) returns numeric
language sql immutable strict set search_path='' as $$
  select 0.5*(case p_urgency when 'high' then 3 when 'medium' then 2 else 1 end)::numeric/3
       + 0.3*(case p_category when 'peace' then 3 when 'infra' then 2 when 'sanitation' then 2 else 1 end)::numeric/3
       + 0.2*least(1,greatest(0,extract(epoch from(p_now-p_created))/18000));
$$;
revoke all on function tugon_private.priority_score(text,text,timestamptz,timestamptz) from public;

create function public.change_case(p_id uuid,p_action text,p_input jsonb default '{}') returns text
language plpgsql security definer set search_path='' as $$
declare role text; team text; own_team text; requested public.service_requests%rowtype; w public.case_work%rowtype; score numeric; skipped integer;
begin
  if p_action='claim' then
    role:=tugon_private.desk_role();
    if not tugon_private.staff_case_allowed(p_id) then raise exception 'Case unavailable' using errcode='42501'; end if;
    select team_id into team from public.case_work where request_id=p_id;
    if team is not null then perform pg_advisory_xact_lock(hashtextextended(team,2)); end if;
    select * into requested from public.service_requests where id=p_id for update;
    select * into w from public.case_work where request_id=p_id for update;
    select team_id into own_team from public.memberships where user_id=auth.uid();
    if requested.status='queued' and w.assignee_id is null and w.team_id=team and (role='supervisor' or (role='handler' and team=own_team)) then
      if coalesce(char_length(trim(p_input->>'reason')),0)<3 then
        score:=tugon_private.priority_score(requested.category,w.urgency,requested.created_at,now());
        select count(*) into skipped from public.service_requests r join public.case_work c on c.request_id=r.id where
          c.team_id=team and c.assignee_id is null and r.status='queued' and (not c.restricted or role='supervisor') and r.id<>p_id
          and (tugon_private.priority_score(r.category,c.urgency,r.created_at,now()),-extract(epoch from r.created_at))>(score,-extract(epoch from requested.created_at));
        if skipped>0 then raise exception 'Add a reason to take a case out of order.' using errcode='P4001',detail=skipped::text; end if;
      end if;
    end if;
  end if;
  return tugon_private.change_case(p_id,p_action,p_input);
end;
$$;
revoke all on function public.change_case(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.change_case(uuid,text,jsonb) to authenticated;
commit;
