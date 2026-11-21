begin;
alter table public.civic_settings add column retention_enabled boolean not null default false;
alter table public.service_requests add column anonymized_at timestamptz;
alter table tugon_private.erasure_requests add column approved_at timestamptz,
  add column approved_by uuid,
  add column prepared_at timestamptz,
  add column former_subject_hash text;
alter table tugon_private.erasure_requests alter column resident_id drop not null;

create table tugon_private.evidence_gc (
  object_name text primary key,
  erasure_id uuid references tugon_private.erasure_requests(id),
  queued_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table tugon_private.evidence_gc enable row level security;
create index evidence_gc_pending on tugon_private.evidence_gc(queued_at,object_name) where removed_at is null;

create function tugon_private.scrub_case(p_id uuid,p_erasure uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare req public.service_requests%rowtype;
begin
  select * into req from public.service_requests where id=p_id for update;
  if not found or req.anonymized_at is not null or req.closed_at is null
      or req.status not in ('resolved','referred','duplicate','withdrawn')
      or exists(select 1 from tugon_private.case_legal_holds where request_id=p_id) then return false; end if;
  insert into tugon_private.evidence_gc(object_name,erasure_id)
  select name,p_erasure from (
    select req.outcome_object as name
    union select req.resident_id::text||'/'||req.submission_key::text||'.jpg' where req.has_photo
    union select 'field/'||a.id::text||'.jpg' from public.field_assignments a where a.request_id=p_id and a.has_photo
  ) objects where name is not null
  on conflict(object_name) do update set erasure_id=coalesce(excluded.erasure_id,tugon_private.evidence_gc.erasure_id);
  delete from public.resident_notifications where request_id=p_id;
  update public.resident_request_events set message=null where request_id=p_id;
  update public.internal_case_events set message=null where request_id=p_id;
  update public.field_assignments set instructions='',report=null,close_reason=null,has_photo=false where request_id=p_id;
  update public.case_work set contact_name=null,contact_phone=null,contact_opt_in=false,override_reason=null,prediction=null where request_id=p_id;
  update public.service_requests set resident_id=null,submission_key=null,description='',location=case when location ? 'purok' then jsonb_build_object('purok',location->>'purok','method','purok') end,
    duplicate_of_ref=null,outcome=null,outcome_photo=false,has_photo=false,follow_up=false,anonymized_at=now() where id=p_id;
  update tugon_private.delivery_outbox set resident_id=null,state=case when state='pending' then 'suppressed' when state='sending' then 'unknown' else state end,
    reason=case when state in ('pending','sending') then 'retention' else reason end,ended_at=case when state in ('pending','sending') then now() else ended_at end
    where request_id=p_id;
  insert into tugon_private.audit_log(action,target_id) values('case_anonymized',p_id);
  return true;
end;
$$;
revoke all on function tugon_private.scrub_case(uuid,uuid) from public;

create function public.stage_retention(p_limit integer default 20) returns integer language plpgsql security definer set search_path='' as $$
declare config public.civic_settings%rowtype; item record; n integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('tugon:retention'));
  select * into config from public.civic_settings where singleton;
  if not config.retention_enabled then return 0; end if;
  for item in select r.id from public.service_requests r where r.anonymized_at is null and r.status in ('resolved','referred','duplicate','withdrawn')
    and r.closed_at < now()-make_interval(months=>config.retention_months)
    and not exists(select 1 from tugon_private.case_legal_holds h where h.request_id=r.id)
    order by r.closed_at,r.id limit least(50,greatest(coalesce(p_limit,20),1)) for update of r skip locked loop
      if tugon_private.scrub_case(item.id) then n:=n+1; end if;
  end loop;
  return n;
end;
$$;

create function public.stage_approved_erasure() returns boolean language plpgsql security definer set search_path='' as $$
declare item tugon_private.erasure_requests%rowtype; report record;
begin
  perform pg_advisory_xact_lock(hashtext('tugon:retention'));
  if not exists(select 1 from public.civic_settings where singleton and retention_enabled) then return false; end if;
  select e.* into item from tugon_private.erasure_requests e where e.approved_at is not null and e.prepared_at is null
    and not exists(select 1 from public.service_requests r where r.resident_id=e.resident_id and (r.closed_at is null or exists(select 1 from tugon_private.case_legal_holds h where h.request_id=r.id)))
    order by e.approved_at,e.id limit 1 for update;
  if not found then return false; end if;
  perform 1 from public.memberships where user_id=item.resident_id and role='resident' for update;
  -- Serialize against case reopen/holds opened after the initial candidate query.
  perform 1 from public.service_requests where resident_id=item.resident_id order by id for update;
  if exists(select 1 from public.service_requests r where r.resident_id=item.resident_id and
      (r.closed_at is null or exists(select 1 from tugon_private.case_legal_holds h where h.request_id=r.id))) then return false; end if;
  update public.memberships set active=false,phone=null,name='' where user_id=item.resident_id and role='resident';
  delete from auth.sessions where user_id=item.resident_id;
  delete from public.resident_profiles where user_id=item.resident_id;
  for report in select id from public.service_requests where resident_id=item.resident_id order by id loop
    if not tugon_private.scrub_case(report.id,item.id) then raise exception 'Erasure could not anonymize every record'; end if;
  end loop;
  insert into tugon_private.evidence_gc(object_name,erasure_id)
    select o.name,item.id from storage.objects o where o.bucket_id='report-evidence' and split_part(o.name,'/',1)=item.resident_id::text
    on conflict(object_name) do update set erasure_id=excluded.erasure_id;
  update tugon_private.delivery_outbox set resident_id=null,state=case when state='pending' then 'suppressed' when state='sending' then 'unknown' else state end
    where resident_id=item.resident_id;
  update tugon_private.erasure_requests set prepared_at=now() where id=item.id;
  insert into tugon_private.audit_log(actor_id,action,target_id) values(item.approved_by,'erasure_prepared',item.id);
  return true;
end;
$$;

create function public.erasure_ready_for_auth() returns table(id uuid,subject uuid)
language sql stable security definer set search_path='' as $$
  select e.id,e.resident_id from tugon_private.erasure_requests e
  where e.prepared_at is not null and e.completed_at is null and e.resident_id is not null
    and not exists(select 1 from tugon_private.evidence_gc g where g.erasure_id=e.id and g.removed_at is null)
  order by e.prepared_at,e.id limit 10;
$$;
create function public.finish_erasure(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare old_subject uuid;
begin
  select subject into old_subject from public.erasure_ready_for_auth() where id=p_id;
  if old_subject is null or exists(select 1 from auth.users where id=old_subject) then return; end if;
  update tugon_private.audit_log set actor_id=null where actor_id=old_subject;
  update tugon_private.erasure_requests set former_subject_hash=encode(sha256(convert_to(old_subject::text,'UTF8')),'hex'),resident_id=null,completed_at=now() where id=p_id;
  insert into tugon_private.audit_log(action,target_id) values('erasure_completed',p_id);
end;
$$;

create function public.queue_abandoned_evidence() returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  for item in select o.name from storage.objects o where o.bucket_id='report-evidence' and o.created_at < now()-interval '24 hours'
    and not exists(select 1 from tugon_private.evidence_gc g where g.object_name=o.name)
    and not exists(select 1 from public.service_requests r where r.outcome_object=o.name or (r.has_photo and r.resident_id::text||'/'||r.submission_key::text||'.jpg'=o.name))
    and not exists(select 1 from public.field_assignments a where a.has_photo and 'field/'||a.id::text||'.jpg'=o.name)
    order by o.created_at,o.name limit 50 loop
    perform pg_advisory_xact_lock(hashtextextended(item.name,1));
    insert into tugon_private.evidence_gc(object_name)
      select item.name where not exists(select 1 from public.service_requests r where r.outcome_object=item.name or (r.has_photo and r.resident_id::text||'/'||r.submission_key::text||'.jpg'=item.name))
      and not exists(select 1 from public.field_assignments a where a.has_photo and 'field/'||a.id::text||'.jpg'=item.name) on conflict do nothing;
  end loop;
end;
$$;
create function public.pending_evidence_gc() returns table(object_name text)
language sql stable security definer set search_path='' as $$
  select g.object_name from tugon_private.evidence_gc g where removed_at is null order by queued_at,g.object_name limit 25;
$$;
create function public.finish_evidence_gc(p_objects text[]) returns void language sql security definer set search_path='' as $$
  update tugon_private.evidence_gc g set removed_at=now() where g.object_name=any(p_objects) and g.removed_at is null
    and not exists(select 1 from storage.objects o where o.bucket_id='report-evidence' and o.name=g.object_name);
$$;

create function tugon_private.guard_pending_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare paths text[]; key text;
begin
  if tg_table_name='field_assignments' then
    paths:=array[case when new.has_photo then 'field/'||new.id::text||'.jpg' end];
  else
    if tg_op='UPDATE' and old.anonymized_at is not null and new.status is distinct from old.status then raise exception 'An anonymized case cannot reopen' using errcode='22023'; end if;
    paths:=array[new.outcome_object,case when new.has_photo then new.resident_id::text||'/'||new.submission_key::text||'.jpg' end];
    if tg_op='INSERT' and new.resident_id is not null then
      perform 1 from public.memberships where user_id=new.resident_id and role='resident' and active for key share;
      if not found then raise exception 'Resident membership required' using errcode='42501'; end if;
    end if;
  end if;
  foreach key in array paths loop
    if key is null then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(key,1));
    if exists(select 1 from tugon_private.evidence_gc g where g.object_name=key and g.removed_at is null) then
      raise exception 'Evidence expired before publication; choose a new file' using errcode='22023';
    end if;
  end loop;
  return new;
end;
$$;
create trigger resident_evidence_gc_guard before insert or update of status,has_photo,outcome_object on public.service_requests for each row execute function tugon_private.guard_pending_evidence();
create trigger field_evidence_gc_guard before update of has_photo on public.field_assignments for each row execute function tugon_private.guard_pending_evidence();
revoke all on function tugon_private.guard_pending_evidence() from public;

revoke all on function public.stage_retention(integer),public.stage_approved_erasure(),public.erasure_ready_for_auth(),public.finish_erasure(uuid),public.queue_abandoned_evidence(),public.pending_evidence_gc(),public.finish_evidence_gc(text[]) from public,anon,authenticated;
grant execute on function public.stage_retention(integer),public.stage_approved_erasure(),public.erasure_ready_for_auth(),public.finish_erasure(uuid),public.queue_abandoned_evidence(),public.pending_evidence_gc(),public.finish_evidence_gc(text[]) to service_role;
commit;
