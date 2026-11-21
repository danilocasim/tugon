begin;

alter table public.civic_settings
  add column hotspot_eps integer not null default 100 check(hotspot_eps between 25 and 1000),
  add column hotspot_min integer not null default 4 check(hotspot_min between 3 and 25),
  add column hotspot_days integer not null default 30 check(hotspot_days between 7 and 365);

create table tugon_private.case_legal_holds (
  request_id uuid primary key references public.service_requests(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  reason text not null
);
alter table tugon_private.case_legal_holds enable row level security;

create function public.staff_admin_members()
returns table(id uuid,name text,email text,role text,team_id text,active boolean,invited boolean)
language sql stable security definer set search_path='' as $$
  select m.user_id,m.name,u.email,m.role,m.team_id,m.active,u.email_confirmed_at is null
  from public.memberships m join auth.users u on u.id=m.user_id
  where (select tugon_private.desk_role())='admin' and m.role in ('intake','handler','supervisor','admin') order by m.name,m.user_id;
$$;
revoke all on function public.staff_admin_members() from public,anon,authenticated;
grant execute on function public.staff_admin_members() to authenticated;

create function public.register_staff_invitation(p_actor uuid,p_user uuid,p_name text,p_role text,p_team text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships m where m.user_id=p_actor and m.active and m.role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
  if p_role not in ('intake','handler','supervisor','admin') or char_length(trim(p_name)) not between 2 and 100
    or not exists(select 1 from auth.users u where u.id=p_user and u.email is not null and u.invited_at is not null)
    or (p_role='handler' and not exists(select 1 from public.teams t where t.id=p_team)) then raise exception 'Invalid staff invitation' using errcode='22023'; end if;
  insert into public.memberships(user_id,role,name,title,team_id) values(p_user,p_role,trim(p_name),initcap(p_role),case when p_role='handler' then p_team end);
  insert into tugon_private.audit_log(actor_id,action,target_id,details) values(p_actor,'staff_invited',p_user,jsonb_build_object('role',p_role));
end;
$$;
revoke all on function public.register_staff_invitation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_staff_invitation(uuid,uuid,text,text,text) to service_role;

create function public.staff_admin_change(p_user uuid,p_active boolean,p_role text default null,p_team text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if (select tugon_private.desk_role()) is distinct from 'admin' or p_user=auth.uid() then raise exception 'Admin required; cannot change your own role here' using errcode='42501'; end if;
  if p_role is not null and (p_role not in ('intake','handler','supervisor','admin') or (p_role='handler' and not exists(select 1 from public.teams t where t.id=p_team))) then raise exception 'Invalid staff role' using errcode='22023'; end if;
  update public.memberships set active=coalesce(p_active,active),role=coalesce(p_role,role),title=coalesce(initcap(p_role),title),
    team_id=case when p_role is null then team_id when p_role='handler' then p_team end where user_id=p_user and role in ('intake','handler','supervisor','admin');
  if not found then raise exception 'Staff member unavailable' using errcode='22023'; end if;
  if p_active=false or p_role is not null then delete from auth.sessions where user_id=p_user; end if;
  insert into tugon_private.audit_log(actor_id,action,target_id,details)
    values(auth.uid(),'staff_membership_changed',p_user,jsonb_build_object('role',p_role,'active',p_active,'team',p_team));
end;
$$;
revoke all on function public.staff_admin_change(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.staff_admin_change(uuid,boolean,text,text) to authenticated;

create function public.staff_admin_settings(p_group text,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if (select tugon_private.desk_role()) is distinct from 'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  case p_group
    when 'targets' then update public.civic_settings set target_high=(p_input->>'high')::numeric,target_medium=(p_input->>'medium')::numeric,target_normal=(p_input->>'normal')::numeric where singleton;
    when 'hotspots' then update public.civic_settings set hotspot_eps=(p_input->>'eps')::integer,hotspot_min=(p_input->>'min')::integer,hotspot_days=(p_input->>'days')::integer where singleton;
    when 'referral_add' then insert into public.referral_offices(name,scope,contact) values(trim(p_input->>'name'),trim(p_input->>'scope'),trim(p_input->>'contact'));
    when 'referral_remove' then delete from public.referral_offices where id=(p_input->>'id')::uuid;
    when 'privacy' then
      if char_length(trim(p_input->>'name')) not between 2 and 100 or coalesce(p_input->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' or char_length(p_input->>'phone') not between 5 and 40 then raise exception 'Invalid privacy contact' using errcode='22023'; end if;
      update public.civic_settings set retention_months=(p_input->>'months')::integer,dpo_name=trim(p_input->>'name'),dpo_email=lower(trim(p_input->>'email')),dpo_phone=trim(p_input->>'phone') where singleton;
    else raise exception 'Unknown settings group' using errcode='22023';
  end case;
  insert into tugon_private.audit_log(actor_id,action) values(auth.uid(),'settings_'||p_group);
end;
$$;
revoke all on function public.staff_admin_settings(text,jsonb) from public,anon,authenticated;
grant execute on function public.staff_admin_settings(text,jsonb) to authenticated;

create function public.staff_admin_audit()
returns table(id uuid,at timestamptz,action text,actor text)
language sql stable security definer set search_path='' as $$
  select l.id,l.occurred_at,l.action,case when m.role in ('intake','handler','supervisor','admin') then m.name else 'Protected identity' end
  from tugon_private.audit_log l left join public.memberships m on m.user_id=l.actor_id
  where (select tugon_private.desk_role())='admin' order by l.occurred_at desc,l.id limit 200;
$$;
revoke all on function public.staff_admin_audit() from public,anon,authenticated;
grant execute on function public.staff_admin_audit() to authenticated;

create function public.admin_retention_preview()
returns table(eligible bigint,held bigint,erasure_pending bigint)
language sql stable security definer set search_path='' as $$
  select (select count(*) from public.service_requests r join public.civic_settings c on c.singleton where r.closed_at < now()-make_interval(months=>c.retention_months)
    and not exists(select 1 from tugon_private.case_legal_holds h where h.request_id=r.id)),
    (select count(*) from tugon_private.case_legal_holds), (select count(*) from tugon_private.erasure_requests where completed_at is null)
  where (select tugon_private.desk_role())='admin';
$$;
revoke all on function public.admin_retention_preview() from public,anon,authenticated;
grant execute on function public.admin_retention_preview() to authenticated;

commit;
