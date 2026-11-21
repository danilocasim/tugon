begin;
alter table public.service_requests add column outcome_object text;
update public.service_requests set outcome_object=id::text||'/outcome.jpg' where outcome_photo;
create function tugon_private.guard_case_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.outcome_photo then new.outcome_object:=null; end if;
  if new.outcome_photo and new.outcome_object is null then raise exception 'Proof must be published by the evidence action' using errcode='22023'; end if;
  return new;
end;
$$;
create trigger guard_outcome_photo before update of outcome_photo,outcome_object on public.service_requests for each row execute function tugon_private.guard_case_photo();
revoke all on function tugon_private.guard_case_photo() from public;

create function public.publish_case_resolution(p_id uuid,p_message text,p_object text default null,p_field uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare key text;
begin
  if not tugon_private.staff_case_allowed(p_id) then raise exception 'Case unavailable' using errcode='42501'; end if;
  perform 1 from public.service_requests where id=p_id for update;
  if p_field is not null then
    if p_object is not null or not exists(select 1 from public.field_assignments where id=p_field and request_id=p_id and status='done' and has_photo) then
      raise exception 'Field proof is not available for this case' using errcode='22023'; end if;
    key:='field/'||p_field::text||'.jpg';
  elsif p_object is not null then
    if p_object !~ ('^outcome/'||p_id::text||'/[0-9a-f-]{36}\.jpg$') then raise exception 'Invalid proof reference' using errcode='22023'; end if;
    key:=p_object;
  end if;
  if key is not null and not exists(select 1 from storage.objects o where o.bucket_id='report-evidence' and o.name=key) then
    raise exception 'Outcome photo missing' using errcode='22023'; end if;
  perform public.change_case(p_id,'resolve',jsonb_build_object('message',p_message));
  if key is not null then update public.service_requests set outcome_object=key,outcome_photo=true where id=p_id; end if;
end;
$$;
revoke all on function public.publish_case_resolution(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.publish_case_resolution(uuid,text,text,uuid) to authenticated;

create function tugon_private.guard_docket_close() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('resolved','referred','duplicate','withdrawn') and new.status is distinct from old.status
    and exists(select 1 from public.lupon_cases where request_id=new.id and closed_at is null) then
      raise exception 'Close the Lupon proceeding before closing this request' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger guard_docket_close before update of status on public.service_requests for each row execute function tugon_private.guard_docket_close();
revoke all on function tugon_private.guard_docket_close() from public;
commit;
