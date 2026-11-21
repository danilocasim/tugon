begin;

create function public.update_resident_preferences(p_email boolean default null,p_phone_changed boolean default false,p_phone text default null,p_sms boolean default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  phone text;
  sms boolean;
  opted_at timestamptz;
begin
  if not tugon_private.session_is_current() or not exists(select 1 from public.memberships m where m.user_id=actor and m.role='resident' and m.active) then raise exception 'Resident membership required' using errcode='42501'; end if;
  if p_phone is not null and p_phone !~ '^\+639[0-9]{9}$' then raise exception 'Invalid phone' using errcode='22023'; end if;
  select m.phone into phone from public.memberships m where m.user_id=actor for update;
  select p.sms_updates,p.sms_opted_in_at into sms,opted_at from public.resident_profiles p where p.user_id=actor for update;
  if p_phone_changed and p_phone is distinct from phone then
    phone := p_phone; sms := false; opted_at := null;
    update public.memberships set phone=p_phone where user_id=actor;
  end if;
  if p_sms and phone is null then raise exception 'Add a mobile number first' using errcode='22023'; end if;
  if p_sms is not null then
    if p_sms and not sms then opted_at := now(); end if;
    if not p_sms then opted_at := null; end if;
    sms := p_sms;
  end if;
  update public.resident_profiles set email_updates=coalesce(p_email,email_updates), sms_updates=sms, sms_opted_in_at=opted_at where user_id=actor;
end;
$$;
revoke all on function public.update_resident_preferences(boolean,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.update_resident_preferences(boolean,boolean,text,boolean) to authenticated;

create table tugon_private.erasure_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null,
  opened_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index one_pending_erasure on tugon_private.erasure_requests(resident_id) where completed_at is null;
alter table tugon_private.erasure_requests enable row level security;

create function public.request_account_erasure(p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not tugon_private.session_is_current() or not exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role='resident' and m.active) then raise exception 'Resident membership required' using errcode='42501'; end if;
  if p_email is null or not exists(select 1 from auth.users where id=auth.uid() and lower(email)=lower(trim(p_email))) then raise exception 'Type the email used for this account' using errcode='22023'; end if;
  insert into tugon_private.erasure_requests(resident_id) values(auth.uid()) on conflict do nothing;
  if found then insert into tugon_private.audit_log(actor_id,action) values(auth.uid(),'erasure_requested'); end if;
end;
$$;
revoke all on function public.request_account_erasure(text) from public,anon,authenticated;
grant execute on function public.request_account_erasure(text) to authenticated;

create function public.record_my_access_export() returns void
language plpgsql security definer set search_path='' as $$
begin
  if not tugon_private.session_is_current() or not exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role='resident' and m.active) then raise exception 'Resident membership required' using errcode='42501'; end if;
  insert into tugon_private.audit_log(actor_id,action) values(auth.uid(),'resident_export');
end;
$$;
revoke all on function public.record_my_access_export() from public,anon,authenticated;
grant execute on function public.record_my_access_export() to authenticated;

commit;
