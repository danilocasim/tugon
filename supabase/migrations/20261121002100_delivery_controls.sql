begin;
drop function public.lease_one_delivery();
create function public.lease_one_delivery(p_channels text[])
returns table(id uuid,channel text,purpose text,kind text,recipient text,ref text,lang text,attempt integer)
language plpgsql security definer set search_path='' as $$
declare job tugon_private.delivery_outbox%rowtype; dest text; ticket text; locale text;
begin
  update tugon_private.delivery_outbox o set state='unknown',reason='lease_interrupted',ended_at=now() where o.state='sending' and o.leased_at < now()-interval '3 minutes';
  for n in 1..60 loop
    select * into job from tugon_private.delivery_outbox o where o.state='pending' and o.channel=any(p_channels) and o.available_at<=now() order by o.available_at,o.id limit 1 for update skip locked;
    if not found then return; end if;
    dest := null; locale := 'fil';
    select r.ref into ticket from public.service_requests r where r.id=job.request_id and r.anonymized_at is null;
    if ticket is not null then
      case job.purpose
        when 'resident' then
          select case when job.channel='sms' and p.sms_updates then m.phone when job.channel='email' and p.email_updates and u.email_confirmed_at is not null then u.email end,p.lang
          into dest,locale from public.resident_profiles p join public.memberships m on m.user_id=p.user_id and m.active
            join auth.users u on u.id=m.user_id join public.service_requests r on r.id=job.request_id and r.resident_id=m.user_id
            where m.user_id=job.resident_id;
        when 'assisted' then
          select case when w.contact_opt_in then w.contact_phone end into dest from public.case_work w where w.request_id=job.request_id;
        when 'assignment' then
          select m.phone into dest from public.field_assignments a join public.memberships m on m.user_id=a.tanod_id and m.active
          where a.id=job.assignment_id and a.status='assigned';
      end case;
    end if;
    if dest is null then
      update tugon_private.delivery_outbox o set state='suppressed',reason='recipient_no_longer_eligible',ended_at=now() where o.id=job.id;
    else
      update tugon_private.delivery_outbox o set state='sending',attempt=o.attempt+1,leased_at=now() where o.id=job.id returning * into job;
      return query select job.id,job.channel,job.purpose,job.kind,dest,ticket,locale,job.attempt;
      return;
    end if;
  end loop;
end;
$$;
revoke all on function public.lease_one_delivery(text[]) from public,anon,authenticated;
grant execute on function public.lease_one_delivery(text[]) to service_role;

create table tugon_private.sms_auth_hook_receipts (
  id_hash text primary key,
  received_at timestamptz not null default now()
);
alter table tugon_private.sms_auth_hook_receipts enable row level security;

create function public.lease_sms_auth_hook(p_id text,p_user uuid,p_phone text) returns text
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(char_length(p_id),0) not between 1 and 128 or not exists(select 1 from public.memberships m where m.user_id=p_user and m.role='tanod' and m.active and m.phone=p_phone) then return 'denied'; end if;
  delete from tugon_private.sms_auth_hook_receipts where received_at < now()-interval '20 minutes';
  insert into tugon_private.sms_auth_hook_receipts(id_hash) values(encode(sha256(convert_to(p_id,'UTF8')),'hex')) on conflict do nothing;
  return case when found then 'leased' else 'duplicate' end;
end;
$$;
revoke all on function public.lease_sms_auth_hook(text,uuid,text) from public,anon,authenticated;
grant execute on function public.lease_sms_auth_hook(text,uuid,text) to service_role;
commit;
