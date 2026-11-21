begin;

create table tugon_private.delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  channel text not null check(channel in ('email','sms')),
  purpose text not null check(purpose in ('resident','assisted','assignment')),
  resident_id uuid,
  request_id uuid,
  assignment_id uuid,
  kind text not null,
  state text not null default 'pending' check(state in ('pending','sending','accepted','suppressed','failed','unknown')),
  attempt integer not null default 0,
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  provider_id text,
  reason text,
  unique(event_key,channel,purpose)
);
create index pending_deliveries on tugon_private.delivery_outbox(available_at,id) where state='pending';
alter table tugon_private.delivery_outbox enable row level security;

create function tugon_private.resident_delivery_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into tugon_private.delivery_outbox(event_key,channel,purpose,resident_id,request_id,kind)
  select new.id::text,p.channel,'resident',new.resident_id,new.request_id,new.kind from public.resident_profiles s
  cross join lateral(values('email',s.email_updates),('sms',s.sms_updates)) p(channel,opted)
  join public.memberships m on m.user_id=s.user_id and m.active
  where s.user_id=new.resident_id and p.opted and (p.channel <> 'sms' or m.phone is not null)
  on conflict do nothing;
  return null;
end;
$$;
create trigger queue_resident_delivery after insert on public.resident_notifications for each row execute function tugon_private.resident_delivery_event();

create function tugon_private.assisted_receipt_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.contact_opt_in and new.contact_phone is not null then
    insert into tugon_private.delivery_outbox(event_key,channel,purpose,request_id,kind) values(new.request_id::text||':receipt','sms','assisted',new.request_id,'receipt') on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger queue_assisted_receipt after insert on public.case_work for each row execute function tugon_private.assisted_receipt_delivery();

create function tugon_private.assisted_status_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.channel in ('walkin','phone') and exists(select 1 from public.case_work w where w.request_id=new.id and w.contact_opt_in and w.contact_phone is not null) then
    insert into tugon_private.delivery_outbox(event_key,channel,purpose,request_id,kind)
      values(new.id::text||':'||new.status||':'||new.updated_at::text,'sms','assisted',new.id,new.status) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger queue_assisted_status after update of status on public.service_requests for each row execute function tugon_private.assisted_status_delivery();

create function tugon_private.field_assignment_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into tugon_private.delivery_outbox(event_key,channel,purpose,request_id,assignment_id,kind)
  values(new.id::text,'sms','assignment',new.request_id,new.id,'assignment') on conflict do nothing;
  return null;
end;
$$;
create trigger queue_assignment_sms after insert on public.field_assignments for each row execute function tugon_private.field_assignment_delivery();

create function public.lease_one_delivery()
returns table(id uuid,channel text,purpose text,kind text,recipient text,ref text,lang text,attempt integer)
language plpgsql security definer set search_path='' as $$
declare job tugon_private.delivery_outbox%rowtype; dest text; ticket text; locale text;
begin
  -- An interrupted HTTP request may have delivered. Never blindly retry a lease after a crash.
  update tugon_private.delivery_outbox o set state='unknown',reason='lease_interrupted',ended_at=now() where o.state='sending' and o.leased_at < now()-interval '3 minutes';
  loop
    select * into job from tugon_private.delivery_outbox o where o.state='pending' and o.available_at<=now() order by o.available_at,o.id limit 1 for update skip locked;
    if not found then return; end if;
    dest := null; locale := 'fil';
    select r.ref into ticket from public.service_requests r where r.id=job.request_id;
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
revoke all on function public.lease_one_delivery() from public,anon,authenticated;
grant execute on function public.lease_one_delivery() to service_role;

create function public.finish_delivery(p_id uuid,p_attempt integer,p_result text,p_provider_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_result not in ('accepted','rejected','throttled','unknown') then raise exception 'Invalid delivery result' using errcode='22023'; end if;
  update tugon_private.delivery_outbox set
    state=case p_result when 'accepted' then 'accepted' when 'unknown' then 'unknown' when 'throttled' then case when attempt<5 then 'pending' else 'failed' end else 'failed' end,
    ended_at=case when p_result='throttled' and attempt<5 then null else now() end,
    available_at=case when p_result='throttled' then now()+make_interval(secs=>60*power(2,least(attempt,5))) else available_at end,
    provider_id=case when p_result='accepted' then left(p_provider_id,100) end,reason=case when p_result<>'accepted' then p_result end
  where id=p_id and state='sending' and attempt=p_attempt;
end;
$$;
revoke all on function public.finish_delivery(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.finish_delivery(uuid,integer,text,text) to service_role;

create function public.delivery_log()
returns table(id uuid,at timestamptz,channel text,purpose text,state text,attempt integer)
language sql stable security definer set search_path='' as $$
  select o.id,o.created_at,o.channel,o.purpose,o.state,o.attempt from tugon_private.delivery_outbox o
    where (select tugon_private.desk_role())='admin' order by o.created_at desc,o.id limit 200;
$$;
revoke all on function public.delivery_log() from public,anon,authenticated;
grant execute on function public.delivery_log() to authenticated;

commit;
