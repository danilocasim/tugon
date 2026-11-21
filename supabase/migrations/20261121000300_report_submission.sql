begin;

create sequence tugon_private.request_reference_seq;
alter table public.service_requests add column submission_key uuid;
alter table public.service_requests add constraint owner_submission_key unique (resident_id, submission_key);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 800000, array['image/jpeg']);
-- No direct browser writes or reads. The web server validates and re-encodes uploads;
-- evidence reads must join back to an authorized, committed request.

create function public.submit_resident_report(
  p_key uuid, p_description text, p_category text, p_danger boolean, p_location jsonb, p_photo boolean
) returns table(id uuid, ref text, replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  new_case public.service_requests%rowtype;
  loc_method text := p_location->>'method';
  loc_zone text := p_location->>'purok';
  loc_lat numeric;
  loc_lon numeric;
  normalized_location jsonb;
  attachment_exists boolean;
  ticket_no bigint;
begin
  if actor is null or not tugon_private.session_is_current() or not exists (
    select 1 from public.memberships m join public.resident_profiles p on p.user_id = m.user_id
    where m.user_id = actor and m.role = 'resident' and m.active
  ) then
    raise exception 'Resident membership required' using errcode = '42501';
  end if;
  if p_key is null then raise exception 'Submission key required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat('report:', actor, '/', p_key), 0));
  select r.* into new_case from public.service_requests r where r.resident_id = actor and r.submission_key = p_key;
  if found then return query select new_case.id, new_case.ref, true; return; end if;

  if p_description is null or char_length(trim(p_description)) not between 10 and 1000
     or (p_category is not null and p_category not in ('peace','infra','sanitation','documents','social'))
     or p_danger is null or p_photo is null then
    raise exception 'Invalid report details' using errcode = '22023';
  end if;
  if p_location is null then
    if p_category is null or p_category not in ('documents', 'social') then
      raise exception 'Location required' using errcode = '22023';
    end if;
  elsif jsonb_typeof(p_location) is distinct from 'object' or loc_method is null
     or loc_method not in ('purok','landmark','pin','device')
     or (loc_zone is not null and loc_zone !~ '^P[1-5]$') then
    raise exception 'Invalid location' using errcode = '22023';
  elsif loc_method = 'purok' then
    if loc_zone is null then raise exception 'Purok required' using errcode = '22023'; end if;
    normalized_location := jsonb_build_object('method', loc_method, 'purok', loc_zone, 'lat', null, 'lon', null, 'landmarkId', null);
  else
    if jsonb_typeof(p_location->'lat') is distinct from 'number' or jsonb_typeof(p_location->'lon') is distinct from 'number' then
      raise exception 'Coordinates required' using errcode = '22023';
    end if;
    loc_lat := (p_location->>'lat')::numeric;
    loc_lon := (p_location->>'lon')::numeric;
    if loc_lat not between 14.3681 and 14.3919 or loc_lon not between 121.028 and 121.052
       or (loc_method = 'landmark' and coalesce(p_location->>'landmarkId','') !~ '^[a-z0-9_-]{1,60}$') then
      raise exception 'Invalid coordinates or landmark' using errcode = '22023';
    end if;
    normalized_location := jsonb_build_object('method', loc_method, 'purok', loc_zone,
      'lat', round(loc_lat, 6), 'lon', round(loc_lon, 6), 'landmarkId', case when loc_method = 'landmark' then p_location->>'landmarkId' end);
  end if;

  select exists (select 1 from storage.objects o where o.bucket_id = 'report-evidence'
    and o.name = concat(actor, '/', p_key, '.jpg')) into attachment_exists;
  if p_photo and not attachment_exists then raise exception 'Evidence not available' using errcode = '22023'; end if;
  ticket_no := nextval('tugon_private.request_reference_seq');
  insert into public.service_requests(ref, resident_id, channel, description, resident_category, danger_now, location, has_photo, submission_key)
  values (concat('TG-', to_char(now() at time zone 'Asia/Manila', 'YYYY'), '-', lpad(ticket_no::text, greatest(4, length(ticket_no::text)), '0')),
    actor, 'online', trim(p_description), p_category, p_danger, normalized_location, p_photo, p_key)
  returning * into new_case;
  insert into public.resident_request_events(request_id, event_type, author) values(new_case.id, 'submitted', 'resident');
  return query select new_case.id, new_case.ref, false;
end;
$$;

revoke all on function public.submit_resident_report(uuid,text,text,boolean,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.submit_resident_report(uuid,text,text,boolean,jsonb,boolean) to authenticated;

commit;
