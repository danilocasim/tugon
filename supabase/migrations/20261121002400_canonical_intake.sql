begin;

-- Match the fictional planning grid in apps/web/src/lib/geo.ts until the pilot
-- boundary and landmarks are approved. Never accept a supplied zone for a pin
-- or supplied coordinates for a landmark. Shared edges use grid order.
create function tugon_private.canonical_report_location(p_location jsonb) returns jsonb
language plpgsql immutable strict set search_path='' as $$
declare method text := p_location->>'method'; zone text; landmark text; lat numeric; lon numeric;
begin
  if jsonb_typeof(p_location) is distinct from 'object' or method is null or method not in ('purok','pin','device','landmark') then
    raise exception 'Invalid location' using errcode='22023';
  end if;
  if method='purok' then
    zone:=p_location->>'purok';
    if zone is null or zone !~ '^P[1-5]$' then raise exception 'Purok required' using errcode='22023'; end if;
  elsif method='landmark' then
    landmark:=p_location->>'landmarkId';
    select l.purok,14.3919-l.y*0.0238/1022,121.028+l.x*0.024/1000 into zone,lat,lon from (values
      ('hall','P1',470,505),('mph','P1',405,455),('health','P1',625,515),('p1-gate','P1',520,395),('p1-alley','P1',565,440),('p1-main','P1',540,418),
      ('p2-chapel','P2',215,250),('p2-court','P2',360,150),('p3-daycare','P3',770,135),('p3-block4','P3',790,160),('p3-corner','P3',755,172),
      ('p4-gym','P4',400,705),('p4-creek','P4',410,740),('p4-junk','P4',440,728),('p5-market','P5',780,760),('p5-school','P5',650,860)
    ) l(id,purok,x,y) where l.id=landmark;
    if not found then raise exception 'Unknown landmark' using errcode='22023'; end if;
  else
    if jsonb_typeof(p_location->'lat') is distinct from 'number' or jsonb_typeof(p_location->'lon') is distinct from 'number' then
      raise exception 'Coordinates required' using errcode='22023';
    end if;
    lat:=(p_location->>'lat')::numeric;
    lon:=(p_location->>'lon')::numeric;
    if lat not between 14.3681 and 14.3919 or lon not between 121.028 and 121.052 then
      raise exception 'Invalid coordinates' using errcode='22023';
    end if;
    select g.purok into zone from (values
      (1,'P2','((0,0),(560,0),(520,300),(300,360),(0,330))'::polygon),
      (2,'P3','((560,0),(1000,0),(1000,380),(700,360),(520,300))'::polygon),
      (3,'P1','((0,330),(300,360),(520,300),(700,360),(680,560),(420,580),(0,560))'::polygon),
      (4,'P4','((0,560),(420,580),(520,1022),(0,1022))'::polygon),
      (5,'P5','((420,580),(680,560),(700,360),(1000,380),(1000,1022),(520,1022))'::polygon)
    ) g(priority,purok,area) where g.area @> point((lon-121.028)*1000/0.024,(14.3919-lat)*1022/0.0238)
    order by g.priority limit 1;
  end if;
  return jsonb_build_object('method',method,'purok',zone,'lat',round(lat,6),'lon',round(lon,6),'landmarkId',landmark);
end;
$$;
revoke all on function tugon_private.canonical_report_location(jsonb) from public,anon,authenticated;

create function tugon_private.next_report_reference() returns text
language plpgsql volatile set search_path='' as $$
declare serial text := nextval('tugon_private.request_reference_seq')::text;
begin
  return 'TGN-'||to_char(now() at time zone 'Asia/Manila','YYMM')||'-'||lpad(serial,greatest(4,length(serial)),'0');
end;
$$;
revoke all on function tugon_private.next_report_reference() from public,anon,authenticated;

create or replace function public.submit_resident_report(
  p_key uuid, p_description text, p_category text, p_danger boolean, p_location jsonb, p_photo boolean
) returns table(id uuid, ref text, replayed boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); new_case public.service_requests%rowtype;
begin
  if actor is null or not tugon_private.session_is_current() or not exists (
    select 1 from public.memberships m join public.resident_profiles p on p.user_id=m.user_id
    where m.user_id=actor and m.role='resident' and m.active
  ) then raise exception 'Resident membership required' using errcode='42501'; end if;
  if p_key is null then raise exception 'Submission key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat('report:',actor,'/',p_key),0));
  select r.* into new_case from public.service_requests r where r.resident_id=actor and r.submission_key=p_key;
  if found then return query select new_case.id,new_case.ref,true; return; end if;

  if p_description is null or char_length(trim(p_description)) not between 10 and 1000
    or (p_category is not null and p_category not in ('peace','infra','sanitation','documents','social')) or p_danger is null or p_photo is null then
    raise exception 'Invalid report details' using errcode='22023';
  end if;
  if p_location is null and (p_category is null or p_category not in ('documents','social')) then raise exception 'Location required' using errcode='22023'; end if;
  if p_photo and not exists(select 1 from storage.objects o where o.bucket_id='report-evidence' and o.name=concat(actor,'/',p_key,'.jpg')) then
    raise exception 'Evidence not available' using errcode='22023';
  end if;
  insert into public.service_requests(ref,resident_id,channel,description,resident_category,danger_now,location,has_photo,submission_key)
  values(tugon_private.next_report_reference(),actor,'online',trim(p_description),p_category,p_danger,tugon_private.canonical_report_location(p_location),p_photo,p_key)
  returning * into new_case;
  insert into public.resident_request_events(request_id,event_type,author) values(new_case.id,'submitted','resident');
  return query select new_case.id,new_case.ref,false;
end;
$$;

create or replace function public.submit_assisted_request(p_channel text,p_description text,p_category text,p_danger boolean,p_location jsonb,
  p_name text,p_phone text,p_sms boolean,p_note text)
returns table(id uuid,ref text) language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); req public.service_requests%rowtype; actor_name text;
begin
  if coalesce(tugon_private.desk_role(),'') not in ('intake','supervisor') then raise exception 'Intake role required' using errcode='42501'; end if;
  if p_channel is null or p_channel not in ('walkin','phone') or p_description is null or char_length(trim(p_description)) not between 10 and 1000
    or (p_category is not null and p_category not in ('peace','infra','sanitation','documents','social')) or p_danger is null
    or p_name is null or char_length(trim(p_name)) not between 2 and 100 or (p_phone is not null and p_phone !~ '^09[0-9]{9}$')
    or p_sms is null or (p_sms and p_phone is null) or char_length(coalesce(p_note,''))>1000 then
    raise exception 'Invalid intake information' using errcode='22023';
  end if;
  select name into actor_name from public.memberships where user_id=actor;
  insert into public.service_requests(ref,channel,description,resident_category,danger_now,location)
  values(tugon_private.next_report_reference(),p_channel,trim(p_description),p_category,p_danger,tugon_private.canonical_report_location(p_location))
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
commit;
