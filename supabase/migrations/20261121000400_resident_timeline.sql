begin;

create function public.update_my_request(p_id uuid, p_action text, p_message text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  request public.service_requests%rowtype;
  event_name text;
  event_message text;
begin
  if not tugon_private.session_is_current() or not exists (
    select 1 from public.memberships m where m.user_id = actor and m.role='resident' and m.active
  ) then raise exception 'Resident membership required' using errcode = '42501'; end if;
  select * into request from public.service_requests r where r.id = p_id and r.resident_id = actor for update;
  if not found then raise exception 'Request not found' using errcode = '42501'; end if;
  case p_action
    when 'reply' then
      if request.status <> 'needs_info' or p_message is null or char_length(trim(p_message)) not between 3 and 1000 then
        raise exception 'Reply is not available' using errcode = '22023';
      end if;
      update public.service_requests set status = 'review', updated_at = now() where id = p_id;
      event_name := 'resident_reply'; event_message := trim(p_message);
    when 'follow_up' then
      if request.status <> 'resolved' or request.follow_up or request.closed_at is null or now() >= request.closed_at + interval '14 days'
         or p_message is null or char_length(trim(p_message)) not between 3 and 1000 then
        raise exception 'Follow-up is not available' using errcode = '22023';
      end if;
      update public.service_requests set follow_up = true, updated_at = now() where id = p_id;
      event_name := 'followup_requested'; event_message := trim(p_message);
    when 'withdraw' then
      if request.status not in ('received','review','needs_info','queued') then raise exception 'Withdrawal is not available' using errcode = '22023'; end if;
      update public.service_requests set status = 'withdrawn', updated_at = now(), closed_at = now() where id = p_id;
      event_name := 'withdrawn';
    else raise exception 'Invalid request action' using errcode = '22023';
  end case;
  insert into public.resident_request_events(request_id,event_type,author,message) values(p_id,event_name,'resident',event_message);
end;
$$;
revoke all on function public.update_my_request(uuid,text,text) from public, anon, authenticated;
grant execute on function public.update_my_request(uuid,text,text) to authenticated;

create function public.read_my_notifications(p_ids uuid[] default null)
returns void language sql set search_path = '' as $$
  update public.resident_notifications set read_at = now()
  where resident_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
$$;
revoke all on function public.read_my_notifications(uuid[]) from public, anon, authenticated;
grant execute on function public.read_my_notifications(uuid[]) to authenticated;
grant update (read_at) on public.resident_notifications to authenticated;
create policy owner_notification_update on public.resident_notifications for update to authenticated
  using (resident_id = (select auth.uid()) and exists (
    select 1 from public.service_requests r where r.id = resident_notifications.request_id
  )) with check (resident_id = (select auth.uid()));

commit;
