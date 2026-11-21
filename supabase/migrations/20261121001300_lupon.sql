begin;
alter table public.civic_settings add column lupon_enabled boolean not null default false;

create sequence tugon_private.lupon_number_seq;
create table public.lupon_cases (
  id uuid primary key default gen_random_uuid(), number text not null unique,
  request_id uuid not null references public.service_requests(id) on delete restrict,
  complainant text not null, respondent text not null, respondent_address text not null, nature text not null,
  filed_at timestamptz not null default now(), filed_by uuid not null,
  stage text not null default 'mediation' check(stage in ('mediation','conciliation','settled','cfa','dismissed','withdrawn')),
  conciliation_start timestamptz, extended boolean not null default false,
  settlement text, settlement_at timestamptz, closed_at timestamptz, close_note text
);
create unique index lupon_open_case on public.lupon_cases(request_id) where closed_at is null;
create table public.lupon_hearings (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.lupon_cases(id) on delete restrict,
  kind text not null check(kind in ('mediation','conciliation')), at timestamptz not null,
  summons_served boolean not null default false,
  result text check(result in ('settled','continued','failed','respondent_absent','complainant_absent')),
  notes text, recorded_at timestamptz
);
create index hearing_date on public.lupon_hearings(case_id,at,id);
alter table public.lupon_cases enable row level security;
alter table public.lupon_hearings enable row level security;
revoke all on public.lupon_cases,public.lupon_hearings from public,anon,authenticated;
grant select on public.lupon_cases,public.lupon_hearings to authenticated;

create function tugon_private.lupon_allowed(p_request uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.civic_settings where singleton and lupon_enabled)
    and tugon_private.staff_case_allowed(p_request) and (
      (select tugon_private.desk_role()) in ('intake','supervisor') or exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role='handler' and m.team_id='t_peace' and m.active)
    );
$$;
revoke all on function tugon_private.lupon_allowed(uuid) from public,anon,authenticated;
grant execute on function tugon_private.lupon_allowed(uuid) to authenticated;
create policy law_visible on public.lupon_cases for select to authenticated using(tugon_private.lupon_allowed(request_id));
create policy hearing_visible on public.lupon_hearings for select to authenticated using(exists(select 1 from public.lupon_cases k where k.id=lupon_hearings.case_id));

create function public.file_lupon_case(p_request uuid,p_complainant text,p_respondent text,p_address text,p_nature text,p_confirmed boolean)
returns table(id uuid,number text) language plpgsql security definer set search_path='' as $$
declare req public.service_requests%rowtype; k public.lupon_cases%rowtype; seq bigint;
begin
  if not tugon_private.lupon_allowed(p_request) then raise exception 'Lupon case unavailable' using errcode='42501'; end if;
  if p_confirmed is distinct from true or coalesce(char_length(trim(p_complainant)),0) not between 2 and 80
     or coalesce(char_length(trim(p_respondent)),0) not between 2 and 80 or coalesce(char_length(trim(p_address)),0) not between 3 and 120
     or coalesce(char_length(trim(p_nature)),0) not between 10 and 600 then raise exception 'Verify the filing details and eligibility' using errcode='22023'; end if;
  select * into req from public.service_requests where public.service_requests.id=p_request for update;
  if not found or not tugon_private.lupon_allowed(p_request) or req.category is distinct from 'peace' or req.status not in ('queued','in_progress') then raise exception 'Only open, triaged peace-and-order cases may be filed' using errcode='22023'; end if;
  seq := nextval('tugon_private.lupon_number_seq');
  insert into public.lupon_cases(number,request_id,complainant,respondent,respondent_address,nature,filed_by)
  values ('KP-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0'),p_request,trim(p_complainant),trim(p_respondent),trim(p_address),trim(p_nature),auth.uid()) returning * into k;
  insert into tugon_private.case_legal_holds(request_id,reason) values(p_request,'Lupon docket') on conflict do nothing;
  update public.case_work set started_at=coalesce(started_at,now()) where request_id=p_request;
  update public.service_requests set status='in_progress',updated_at=now() where public.service_requests.id=p_request;
  insert into public.resident_request_events(request_id,event_type,author,message) values(p_request,'kp_filed','staff','Filed with the Lupon as '||k.number||'. The barangay will advise you of the next step.');
  if req.resident_id is not null then insert into public.resident_notifications(request_id,resident_id,kind) values(p_request,req.resident_id,'update'); end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(auth.uid(),'kp_filed',k.id);
  return query select k.id,k.number;
end;
$$;
revoke all on function public.file_lupon_case(uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.file_lupon_case(uuid,text,text,text,text,boolean) to authenticated;

create or replace function public.change_lupon_case(p_id uuid,p_action text,p_value jsonb default '{}')
returns text language plpgsql security definer set search_path='' as $$
declare
  req public.service_requests%rowtype; k public.lupon_cases%rowtype; h public.lupon_hearings%rowtype;
  request_ref uuid; hearing_id uuid; hearing_at timestamptz; outcome text; hearing_result text; settlement text;
  hearing_note text := trim(coalesce(p_value->>'notes','')); public_text text; notice text; public_event text;
begin
  select request_id into request_ref from public.lupon_cases where id=p_id;
  if not tugon_private.lupon_allowed(request_ref) then raise exception 'Lupon case unavailable' using errcode='42501'; end if;
  select * into req from public.service_requests where id=request_ref for update;
  select * into k from public.lupon_cases where id=p_id for update;
  if not found or not tugon_private.lupon_allowed(request_ref) then raise exception 'Lupon case unavailable' using errcode='42501'; end if;
  if k.closed_at is not null or char_length(hearing_note)>1000 then raise exception 'The proceeding is closed or the note is too long' using errcode='22023'; end if;
  case p_action
    when 'schedule' then
      hearing_at := (p_value->>'at')::timestamptz;
      if hearing_at is null or hearing_at < now()-interval '1 hour' or hearing_at > now()+interval '60 days' then raise exception 'Pick a date within the next 60 days' using errcode='22023'; end if;
      insert into public.lupon_hearings(case_id,kind,at) values(k.id,k.stage,hearing_at);
      public_text := 'A Lupon hearing is scheduled for '||to_char(hearing_at at time zone 'Asia/Manila','FMMonth DD, YYYY at HH12:MI AM')||' Manila time. Contact the barangay hall for instructions.';
      notice:='hearing'; public_event:='kp_hearing';
    when 'served','record' then
      hearing_id := (p_value->>'hearing')::uuid;
      select * into h from public.lupon_hearings where id=hearing_id and case_id=k.id for update;
      if not found or h.result is not null then raise exception 'Hearing unavailable' using errcode='22023'; end if;
      if p_action='served' then update public.lupon_hearings set summons_served=true where id=h.id;
      else
        hearing_result := p_value->>'result';
        if h.kind<>k.stage or h.at>now()+interval '2 hours' or hearing_result is null or hearing_result not in ('settled','continued','failed','respondent_absent','complainant_absent') then raise exception 'Check hearing date, stage and result' using errcode='22023'; end if;
        if hearing_result in ('respondent_absent','complainant_absent') and not h.summons_served then raise exception 'Record service of summons before using nonappearance' using errcode='22023'; end if;
        update public.lupon_hearings set result=hearing_result,notes=nullif(hearing_note,''),recorded_at=now() where id=h.id;
        if hearing_result='failed' and k.stage='mediation' then k.stage:='conciliation'; k.conciliation_start:=now(); end if;
        if hearing_result='settled' then
          settlement:=trim(p_value->>'settlement');
          if coalesce(char_length(settlement),0) not between 20 and 2000 then raise exception 'Enter the settlement terms' using errcode='22023'; end if;
          k.stage:='settled'; k.settlement:=settlement; k.settlement_at:=now(); k.closed_at:=now();
          public_text:='The Lupon recorded a settlement in '||k.number||'. Contact the barangay for your copy and the repudiation period.';
        end if;
      end if;
    when 'extend' then
      if k.stage<>'conciliation' or k.extended or now()>k.conciliation_start+interval '15 days' then raise exception 'This conciliation cannot be extended' using errcode='22023'; end if;
      k.extended:=true;
    when 'close' then
      outcome:=p_value->>'outcome';
      if outcome is null or outcome not in ('cfa','dismissed','withdrawn') or char_length(hearing_note) not between 3 and 600 then raise exception 'Choose a closing reason' using errcode='22023'; end if;
      if outcome='cfa' and not (exists(select 1 from public.lupon_hearings where case_id=k.id and result='respondent_absent' and summons_served)
        or (k.stage='conciliation' and (now()>k.conciliation_start+case when k.extended then interval '30 days' else interval '15 days' end
          or exists(select 1 from public.lupon_hearings where case_id=k.id and kind='conciliation' and result='failed')))) then raise exception 'Certificate requirements not met' using errcode='22023'; end if;
      if outcome='dismissed' and not exists(select 1 from public.lupon_hearings where case_id=k.id and result='complainant_absent' and summons_served) then raise exception 'No qualifying missed hearing' using errcode='22023'; end if;
      k.stage:=outcome; k.closed_at:=now(); k.close_note:=hearing_note;
      public_text:=case outcome when 'cfa' then 'A Certificate to File Action is available at the barangay hall for ' when 'dismissed' then 'The Lupon dismissed the complaint in ' else 'The complaint was withdrawn from the Lupon in ' end||k.number||'.';
    else raise exception 'Unknown Lupon action' using errcode='22023';
  end case;
  update public.lupon_cases set stage=k.stage,conciliation_start=k.conciliation_start,extended=k.extended,
    settlement=k.settlement,settlement_at=k.settlement_at,closed_at=k.closed_at,close_note=k.close_note where id=k.id;
  if k.closed_at is not null then
    update public.service_requests set status='resolved',outcome=public_text,outcome_photo=false,closed_at=now(),updated_at=now() where id=request_ref and status in ('queued','in_progress');
    public_event:='resolved'; notice:='resolved';
  elsif public_event is not null then update public.service_requests set updated_at=now() where id=request_ref; end if;
  if public_event is not null then
    insert into public.resident_request_events(request_id,event_type,author,message) values(request_ref,public_event,'staff',public_text);
    if req.resident_id is not null then insert into public.resident_notifications(request_id,resident_id,kind) values(request_ref,req.resident_id,notice); end if;
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(auth.uid(),'kp_'||p_action,k.id);
  return k.stage;
end;
$$;
revoke all on function public.change_lupon_case(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.change_lupon_case(uuid,text,jsonb) to authenticated;

commit;
