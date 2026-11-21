begin;

alter table public.civic_settings
  add column target_high numeric not null default 2 check (target_high between 0.25 and 8760),
  add column target_medium numeric not null default 24 check (target_medium between 0.25 and 8760),
  add column target_normal numeric not null default 72 check (target_normal between 0.25 and 8760);
create table public.referral_offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 120),
  scope text not null check (char_length(scope) <= 160),
  contact text not null check (char_length(contact) <= 160)
);
alter table public.referral_offices enable row level security;
revoke all on public.referral_offices from public,anon,authenticated;
grant select on public.referral_offices to authenticated;
create policy desk_referral_read on public.referral_offices for select to authenticated using ((select tugon_private.desk_role()) is not null);

alter table public.case_work add column contact_name text, add column contact_phone text, add column contact_opt_in boolean not null default false;
create function public.submit_assisted_request(p_channel text,p_description text,p_category text,p_danger boolean,p_location jsonb,
  p_name text,p_phone text,p_sms boolean,p_note text)
returns table(id uuid,ref text) language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  seq bigint;
  req public.service_requests%rowtype;
  actor_name text;
  loc jsonb;
  method text := p_location->>'method';
  zone text := p_location->>'purok';
  lat numeric;
  lon numeric;
begin
  if coalesce(tugon_private.desk_role(),'') not in ('intake','supervisor') then raise exception 'Intake role required' using errcode='42501'; end if;
  if p_channel is null or p_channel not in ('walkin','phone') or p_description is null or char_length(trim(p_description)) not between 10 and 1000
    or (p_category is not null and p_category not in ('peace','infra','sanitation','documents','social')) or p_danger is null
    or p_name is null or char_length(trim(p_name)) not between 2 and 100 or (p_phone is not null and p_phone !~ '^09[0-9]{9}$')
    or p_sms is null or (p_sms and p_phone is null) or char_length(coalesce(p_note,''))>1000 then
    raise exception 'Invalid intake information' using errcode='22023';
  end if;
  if p_location is not null then
    if jsonb_typeof(p_location)<>'object' or method is null or method not in ('purok','pin','device','landmark') or (zone is not null and zone !~ '^P[1-5]$') then
       raise exception 'Invalid location' using errcode='22023';
    end if;
    if method<>'purok' then
      if jsonb_typeof(p_location->'lat') is distinct from 'number' or jsonb_typeof(p_location->'lon') is distinct from 'number' then raise exception 'Invalid coordinates' using errcode='22023'; end if;
      lat := (p_location->>'lat')::numeric; lon := (p_location->>'lon')::numeric;
      if lat not between 14.3681 and 14.3919 or lon not between 121.028 and 121.052 then raise exception 'Invalid coordinates' using errcode='22023'; end if;
    elsif zone is null then raise exception 'Purok required' using errcode='22023';
    end if;
    loc := jsonb_build_object('method',method,'purok',zone,'lat',round(lat,6),'lon',round(lon,6),'landmarkId',case when method='landmark' then left(p_location->>'landmarkId',60) end);
  end if;
  select name into actor_name from public.memberships where user_id=actor;
  seq := nextval('tugon_private.request_reference_seq');
  insert into public.service_requests(ref,channel,description,resident_category,danger_now,location)
  values ('TGN-'||to_char(now() at time zone 'Asia/Manila','YYMM')||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),p_channel,trim(p_description),p_category,p_danger,loc)
  returning * into req;
  insert into public.case_work(request_id,contact_name,contact_phone,contact_opt_in) values(req.id,trim(p_name),p_phone,p_sms);
  insert into public.resident_request_events(request_id,event_type,author) values(req.id,'submitted','staff');
  if nullif(trim(p_note),'') is not null then
    insert into public.internal_case_events(request_id,actor_id,actor_name,event_type,message) values(req.id,actor,actor_name,'note',trim(p_note));
  end if;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(actor,'assisted_submit',req.id);
  return query select req.id,req.ref;
end;
$$;
revoke all on function public.submit_assisted_request(text,text,text,boolean,jsonb,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_assisted_request(text,text,text,boolean,jsonb,text,text,boolean,text) to authenticated;

create function public.case_reporter(p_id uuid)
returns table(id uuid,name text,purok text) language sql stable security definer set search_path='' as $$
  select m.user_id,m.name,p.purok from public.service_requests r join public.memberships m on m.user_id=r.resident_id
  join public.resident_profiles p on p.user_id=m.user_id where r.id=p_id and tugon_private.staff_case_allowed(p_id);
$$;
revoke all on function public.case_reporter(uuid) from public,anon,authenticated;
grant execute on function public.case_reporter(uuid) to authenticated;

commit;
