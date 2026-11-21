begin;

create function tugon_private.desk_role()
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('intake','handler','supervisor','admin')
    and (select auth.jwt()->>'aal') = 'aal2' and (select tugon_private.session_is_current())
    and (select coalesce(auth.jwt()->'amr','[]'::jsonb)) @? '$[*] ? (@.method == "password" || @ == "password")'
$$;
revoke all on function tugon_private.desk_role() from public, anon, authenticated;
grant execute on function tugon_private.desk_role() to authenticated;

create table public.duty_roster (
  officer_id uuid not null references public.memberships(user_id) on delete restrict,
  local_date date not null,
  shift text not null check (shift in ('day','night')),
  primary key (local_date, shift, officer_id)
);
create index duty_roster_officer_dates on public.duty_roster(officer_id, local_date);
alter table public.duty_roster enable row level security;
revoke all on public.duty_roster from public, anon, authenticated;
grant select on public.duty_roster to authenticated;
create policy duty_read on public.duty_roster for select to authenticated using (
  (select tugon_private.desk_role()) is not null or (
    officer_id = (select auth.uid()) and exists (
      select 1 from public.memberships m where m.user_id = duty_roster.officer_id and m.role = 'tanod'
    )
  )
);
create policy desk_officers_read on public.memberships for select to authenticated using (
  role = 'tanod' and (select tugon_private.desk_role()) is not null
);

create function public.change_officer_duty(p_officer uuid, p_date date, p_shift text, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor', 'admin') then
    raise exception 'Roster editor required' using errcode = '42501';
  end if;
  if p_date is null or p_date not between (now() at time zone 'Asia/Manila')::date - 1 and (now() at time zone 'Asia/Manila')::date + 366
     or p_shift is null or p_shift not in ('day','night') or p_on is null or not exists (
       select 1 from public.memberships m where m.user_id = p_officer and m.role = 'tanod' and m.active
     ) then raise exception 'Invalid duty shift' using errcode = '22023'; end if;
  if p_on then
    insert into public.duty_roster(officer_id,local_date,shift) values(p_officer,p_date,p_shift) on conflict do nothing;
  else
    delete from public.duty_roster where officer_id = p_officer and local_date = p_date and shift = p_shift;
  end if;
  if found then
    insert into tugon_private.audit_log(actor_id,action,target_id,details)
    values(auth.uid(), case when p_on then 'duty_added' else 'duty_removed' end, p_officer, jsonb_build_object('date',p_date,'shift',p_shift));
  end if;
end;
$$;
revoke all on function public.change_officer_duty(uuid,date,text,boolean) from public, anon, authenticated;
grant execute on function public.change_officer_duty(uuid,date,text,boolean) to authenticated;

create function public.copy_duty_week(p_monday date)
returns integer language plpgsql security definer set search_path = '' as $$
declare amount integer; today date := (now() at time zone 'Asia/Manila')::date;
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor','admin') then raise exception 'Roster editor required' using errcode = '42501'; end if;
  if p_monday is null or extract(isodow from p_monday) <> 1 or p_monday + 6 < today or p_monday + 6 > today + 366 then
    raise exception 'Invalid target week' using errcode = '22023';
  end if;
  insert into public.duty_roster(officer_id,local_date,shift)
  select r.officer_id,r.local_date + 7,r.shift from public.duty_roster r
  join public.memberships m on m.user_id = r.officer_id and m.role = 'tanod' and m.active
  where r.local_date between p_monday - 7 and p_monday - 1 and r.local_date + 7 >= today - 1
  on conflict do nothing;
  get diagnostics amount = row_count;
  if amount > 0 then
    insert into tugon_private.audit_log(actor_id,action,details) values(auth.uid(),'duty_week_copied',jsonb_build_object('week',p_monday,'shifts',amount));
  end if;
  return amount;
end;
$$;
revoke all on function public.copy_duty_week(date) from public, anon, authenticated;
grant execute on function public.copy_duty_week(date) to authenticated;

create function public.set_officer_active(p_officer uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(tugon_private.desk_role(),'') not in ('supervisor','admin') then raise exception 'Roster editor required' using errcode = '42501'; end if;
  if p_active is null then raise exception 'Specify whether the officer is active' using errcode = '22023'; end if;
  update public.memberships set active = p_active where user_id = p_officer and role = 'tanod' and active <> p_active;
  if found then
    if not p_active then delete from auth.sessions where user_id = p_officer; end if;
    insert into tugon_private.audit_log(actor_id,action,target_id) values(auth.uid(),case when p_active then 'officer_reinstated' else 'officer_deactivated' end,p_officer);
  end if;
end;
$$;
revoke all on function public.set_officer_active(uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_officer_active(uuid,boolean) to authenticated;

commit;

begin;
create function public.register_officer(p_actor uuid,p_user uuid,p_name text,p_phone text,p_zone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m where m.user_id=p_actor and m.active and m.role in ('admin','supervisor')) then
    raise exception 'Roster editor required' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_zone is null or p_zone !~ '^P[1-5]$'
    or p_phone is null or p_phone !~ '^\+639[0-9]{9}$'
    or not exists (select 1 from auth.users u where u.id=p_user and ('+' || u.phone)=p_phone) then
    raise exception 'Invalid officer details' using errcode = '22023';
  end if;
  insert into public.memberships(user_id,role,name,title,zone,phone) values(p_user,'tanod',trim(p_name),'Tanod',p_zone,p_phone);
  insert into tugon_private.audit_log(actor_id,action,target_id) values(p_actor,'officer_registered',p_user);
end;
$$;
revoke all on function public.register_officer(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.register_officer(uuid,uuid,text,text,text) to service_role;
commit;
