begin;
-- Incident candidates contain case references only for the authenticated supervisor.
grant select(ref) on public.service_requests to service_role;

alter table tugon_private.sms_auth_hook_receipts add column accepted_at timestamptz;
create or replace function public.lease_sms_auth_hook(p_id text,p_user uuid,p_phone text) returns text
language plpgsql security definer set search_path='' as $$
declare receipt text;
begin
  if coalesce(char_length(p_id),0) not between 1 and 128 or not exists(select 1 from public.memberships m where m.user_id=p_user and m.role='tanod' and m.active and m.phone=p_phone) then return 'denied'; end if;
  receipt:=encode(sha256(convert_to(p_id,'UTF8')),'hex');
  delete from tugon_private.sms_auth_hook_receipts where received_at < now()-interval '20 minutes';
  insert into tugon_private.sms_auth_hook_receipts(id_hash) values(receipt) on conflict do nothing;
  if found then return 'leased'; end if;
  return case when exists(select 1 from tugon_private.sms_auth_hook_receipts where id_hash=receipt and accepted_at is not null) then 'accepted' else 'unconfirmed' end;
end;
$$;

create function public.accept_sms_auth_hook(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update tugon_private.sms_auth_hook_receipts set accepted_at=coalesce(accepted_at,now())
  where id_hash=encode(sha256(convert_to(p_id,'UTF8')),'hex');
  return found;
end;
$$;
revoke all on function public.accept_sms_auth_hook(text) from public,anon,authenticated;
grant execute on function public.accept_sms_auth_hook(text) to service_role;

create or replace function public.register_officer(p_actor uuid,p_user uuid,p_name text,p_phone text,p_zone text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from public.memberships m where m.user_id=p_actor and m.active and m.role in ('admin','supervisor')) then
    raise exception 'Roster editor required' using errcode='42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_zone is null or p_zone !~ '^P[1-5]$'
    or p_phone is null or p_phone !~ '^\+639[0-9]{9}$'
    or not exists (select 1 from auth.users u where u.id=p_user and ltrim(u.phone,'+')=substr(p_phone,2)) then
    raise exception 'Invalid officer details' using errcode='22023';
  end if;
  insert into public.memberships(user_id,role,name,title,zone,phone) values(p_user,'tanod',trim(p_name),'Tanod',p_zone,p_phone);
  insert into tugon_private.audit_log(actor_id,action,target_id) values(p_actor,'officer_registered',p_user);
end;
$$;
commit;
