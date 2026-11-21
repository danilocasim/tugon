begin;

create function tugon_private.can_subscribe(topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active
    and (select tugon_private.session_is_current()) and (
      (m.role='resident' and topic='tugon:resident:'||m.user_id::text)
      or (m.role='tanod' and topic='tugon:tanod:'||m.user_id::text)
      or ((select tugon_private.desk_role()) in ('intake','handler','supervisor') and (
        topic='tugon:staff:'||m.user_id::text
        or (m.role='supervisor' and topic='tugon:supervisors')
        or (m.role='intake' and topic='tugon:intake')
        or (m.role='handler' and topic='tugon:team:'||m.team_id)
      ))));
$$;
revoke all on function tugon_private.can_subscribe(text) from public,anon,authenticated;
grant execute on function tugon_private.can_subscribe(text) to authenticated;
create policy tugon_receive_invalidations on realtime.messages for select to authenticated
  using (extension='broadcast' and (select tugon_private.can_subscribe(realtime.topic())));

create function tugon_private.notify_case_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  w public.case_work%rowtype;
begin
  select * into w from public.case_work where request_id=new.id;
  if new.resident_id is not null and (tg_op='INSERT' or old.updated_at is distinct from new.updated_at) then
    perform realtime.send('{}'::jsonb,'changed','tugon:resident:'||new.resident_id::text,true);
  end if;
  perform realtime.send('{}'::jsonb,'changed','tugon:supervisors',true);
  if not coalesce(w.restricted,false) or new.status in ('received','review','needs_info') then
    perform realtime.send('{}'::jsonb,'changed','tugon:intake',true);
  end if;
  if not coalesce(w.restricted,false) and w.team_id is not null then
    perform realtime.send('{}'::jsonb,'changed','tugon:team:'||w.team_id,true);
  end if;
  if w.assignee_id is not null then
    perform realtime.send('{}'::jsonb,'changed','tugon:staff:'||w.assignee_id::text,true);
  end if;
  return null;
end;
$$;
revoke all on function tugon_private.notify_case_changed() from public,anon,authenticated;
create trigger case_changed after insert or update on public.service_requests for each row execute function tugon_private.notify_case_changed();

create function tugon_private.notify_duty_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send('{}'::jsonb,'changed','tugon:tanod:'||coalesce(new.officer_id,old.officer_id)::text,true);
  return null;
end;
$$;
revoke all on function tugon_private.notify_duty_changed() from public,anon,authenticated;
create trigger duty_changed after insert or delete on public.duty_roster for each row execute function tugon_private.notify_duty_changed();

commit;
