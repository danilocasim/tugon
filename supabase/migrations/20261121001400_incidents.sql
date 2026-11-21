begin;
create sequence tugon_private.incident_number_seq;
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  title text not null check(char_length(title) between 4 and 120),
  category text not null references public.teams(category),
  lat double precision not null,
  lon double precision not null,
  radius_m double precision not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  closed_at timestamptz,
  outcome text
);
create table public.incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  actor_id uuid not null,
  affected integer not null default 0,
  unique(incident_id,message)
);
alter table public.case_work add column incident_id uuid references public.incidents on delete set null;
create index case_work_incident on public.case_work(incident_id) where incident_id is not null;
alter table public.incidents enable row level security;
alter table public.incident_updates enable row level security;
revoke all on public.incidents, public.incident_updates from public, anon, authenticated;
grant select on public.incidents, public.incident_updates to authenticated;
create policy incident_desk on public.incidents for select to authenticated using((select tugon_private.desk_role()) in ('intake','supervisor'));
create policy incident_log_desk on public.incident_updates for select to authenticated using((select tugon_private.desk_role()) in ('intake','supervisor'));

create function tugon_private.incident_distance(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable strict set search_path='' as $$
  select 12742000*asin(least(1::double precision,sqrt(power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))));
$$;
revoke all on function tugon_private.incident_distance(double precision,double precision,double precision,double precision) from public;

create function public.start_incident(p_title text,p_requests uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare ids uuid[]; item uuid; req public.service_requests%rowtype; work public.case_work%rowtype; cat text; cats text[]:='{}'; xs double precision[]:='{}'; ys double precision[]:='{}'; x double precision; y double precision; r double precision; id uuid;
begin
  if coalesce(tugon_private.desk_role(),'') not in ('intake','supervisor') then raise exception 'Incident unavailable' using errcode='42501'; end if;
  if coalesce(char_length(trim(p_title)),0) not between 4 and 120 or coalesce(cardinality(p_requests),0) not between 2 and 100 then raise exception 'Select two to one hundred nearby reports and add a title' using errcode='22023'; end if;
  select array_agg(distinct k order by k) into ids from unnest(p_requests) k;
  if cardinality(ids)<>cardinality(p_requests) then raise exception 'Duplicate report' using errcode='22023'; end if;
  foreach item in array ids loop
    select * into req from public.service_requests where service_requests.id=item for update;
    select * into work from public.case_work where request_id=item for update;
    cat:=coalesce(req.category,work.prediction->>'category',req.resident_category);
    if req.id is null or not tugon_private.staff_case_allowed(item) or coalesce(work.restricted,false) or work.incident_id is not null
      or req.status not in ('received','review','needs_info','queued','in_progress') or cat is null or cat not in ('peace','infra','sanitation')
      or req.location->>'lat' is null or req.location->>'lon' is null or req.location->>'method'='purok' then raise exception 'A report is not eligible for this incident' using errcode='22023'; end if;
    insert into public.case_work(request_id) values(item) on conflict do nothing;
    cats:=array_append(cats,cat); xs:=array_append(xs,(req.location->>'lat')::double precision); ys:=array_append(ys,(req.location->>'lon')::double precision);
  end loop;
  select avg(xs[n]),avg(ys[n]) into x,y from generate_subscripts(xs,1) s(n);
  select max(tugon_private.incident_distance(x,y,xs[n],ys[n])) into r from generate_subscripts(xs,1) s(n);
  if r>1000 then raise exception 'Reports must be within one kilometre of the incident center' using errcode='22023'; end if;
  select c into cat from unnest(cats) c group by c order by count(*) desc,c limit 1;
  insert into public.incidents(ref,title,category,lat,lon,radius_m,created_by) values('INC-'||nextval('tugon_private.incident_number_seq'),trim(p_title),cat,x,y,greatest(80,r),auth.uid()) returning incidents.id into id;
  update public.case_work set incident_id=id where request_id=any(ids);
  insert into tugon_private.audit_log(actor_id,action,target_id) values(auth.uid(),'incident_created',id);
  return id;
end;
$$;

create or replace function public.change_incident(p_id uuid,p_action text,p_request uuid default null,p_message text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidents%rowtype; req public.service_requests%rowtype; w public.case_work%rowtype; update_id uuid; n integer:=0; remaining integer:=0; closed integer:=0; dest uuid[]:='{}'; phones text[]:='{}'; msg text:=trim(p_message); desk text:=tugon_private.desk_role();
begin
  if coalesce(desk,'') not in ('intake','supervisor') or (p_action='close' and desk<>'supervisor') then raise exception 'Incident unavailable' using errcode='42501'; end if;
  select * into i from public.incidents where id=p_id for update;
  if not found then raise exception 'Incident unavailable' using errcode='42501'; end if;
  if p_action='broadcast' and exists(select 1 from public.incident_updates where incident_id=p_id and message=msg) then
    return (select jsonb_build_object('reached',affected,'resolved',0,'leftOpen',0) from public.incident_updates where incident_id=p_id and message=msg);
  end if;
  if i.closed_at is not null then raise exception 'The incident is closed' using errcode='22023'; end if;
  if p_action in ('link','unlink') then
    select * into req from public.service_requests where id=p_request for update;
    select * into w from public.case_work where request_id=p_request for update;
    if req.id is null or not tugon_private.staff_case_allowed(p_request) or coalesce(w.restricted,false) then raise exception 'Report unavailable' using errcode='42501'; end if;
    if p_action='unlink' then
      update public.case_work set incident_id=null where request_id=p_request and incident_id=p_id;
    else
      if w.incident_id=p_id then return '{}'::jsonb; end if;
      if w.incident_id is not null or req.status not in ('received','review','needs_info','queued','in_progress') or coalesce(req.category,w.prediction->>'category',req.resident_category) is distinct from i.category
        or coalesce(tugon_private.incident_distance(i.lat,i.lon,(req.location->>'lat')::double precision,(req.location->>'lon')::double precision),1000000)>i.radius_m+80 then raise exception 'This report is not eligible for the incident' using errcode='22023'; end if;
      insert into public.case_work(request_id,incident_id) values(p_request,p_id) on conflict(request_id) do update set incident_id=excluded.incident_id;
    end if;
  elsif p_action in ('broadcast','close') then
    if coalesce(char_length(msg),0) not between 10 and 600 then raise exception 'Enter a public message of 10 to 600 characters' using errcode='22023'; end if;
    if p_action='broadcast' then
      insert into public.incident_updates(incident_id,message,actor_id) values(p_id,msg,auth.uid()) returning id into update_id;
    else update public.incidents set closed_at=now(),outcome=msg where id=p_id; end if;
    for req in select r.* from public.service_requests r join public.case_work c on c.request_id=r.id
      where c.incident_id=p_id order by r.id for update of r loop
      select * into w from public.case_work where request_id=req.id for update;
      if w.restricted or not tugon_private.staff_case_allowed(req.id) or req.status in ('duplicate','withdrawn','referred','resolved') then continue; end if;
      if p_action='close' and (req.status not in ('queued','in_progress') or w.assignee_id is null or exists(select 1 from public.lupon_cases where request_id=req.id and closed_at is null)) then
        remaining:=remaining+1; continue;
      end if;
      if p_action='close' then
        update public.service_requests set status='resolved',outcome=msg,closed_at=now(),updated_at=now() where id=req.id;
        closed:=closed+1;
      else update public.service_requests set updated_at=now() where id=req.id; end if;
      insert into public.resident_request_events(request_id,event_type,author,message) values(req.id,case when p_action='close' then 'resolved' else 'incident_update' end,'staff',msg);
      if req.resident_id is not null and not(req.resident_id=any(dest)) then
        insert into public.resident_notifications(request_id,resident_id,kind) values(req.id,req.resident_id,case when p_action='close' then 'resolved' else 'update' end);
        dest:=array_append(dest,req.resident_id);
      elsif p_action='broadcast' and w.contact_opt_in and w.contact_phone is not null and not(w.contact_phone=any(phones)) then
        insert into tugon_private.delivery_outbox(event_key,channel,purpose,request_id,kind) values(update_id::text||':'||req.id::text,'sms','assisted',req.id,'incident_update') on conflict do nothing;
        phones:=array_append(phones,w.contact_phone);
      end if;
      n:=n+1;
    end loop;
    if update_id is not null then update public.incident_updates set affected=n where id=update_id; end if;
  else raise exception 'Unknown incident action' using errcode='22023'; end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(auth.uid(),'incident_'||p_action,p_id);
  return jsonb_build_object('reached',n,'resolved',closed,'leftOpen',remaining);
end;
$$;
revoke all on function public.start_incident(text,uuid[]),public.change_incident(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.start_incident(text,uuid[]),public.change_incident(uuid,text,uuid,text) to authenticated;
commit;
