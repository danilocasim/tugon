begin;

create schema if not exists tugon_private;
revoke all on schema tugon_private from public, anon, authenticated;

create table public.teams (
  id text primary key,
  name text not null check (char_length(name) between 1 and 100)
);

insert into public.teams (id, name) values
  ('t_peace', 'Peace & Order'), ('t_works', 'Public Works'), ('t_health', 'Sanitation & Health'),
  ('t_records', 'Records'), ('t_social', 'Social Services');

create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('resident', 'intake', 'handler', 'supervisor', 'admin', 'tanod')),
  active boolean not null default true,
  name text not null check (char_length(name) <= 100),
  team_id text references public.teams(id),
  title text not null default '',
  zone text,
  phone text check (phone is null or phone ~ '^\+639[0-9]{9}$'),
  created_at timestamptz not null default now(),
  check (role <> 'handler' or team_id is not null),
  check (role <> 'tanod' or phone is not null)
);

create unique index memberships_officer_phone on public.memberships(phone) where role = 'tanod';

create table public.resident_profiles (
  user_id uuid primary key references public.memberships(user_id) on delete cascade,
  purok text not null check (char_length(purok) between 1 and 32),
  lang text not null check (lang in ('en', 'fil')),
  notice_version text not null check (char_length(notice_version) between 1 and 32),
  agreed_at timestamptz not null default now(),
  email_updates boolean not null default false,
  sms_updates boolean not null default false,
  sms_opted_in_at timestamptz,
  check (not sms_updates or sms_opted_in_at is not null)
);

create table tugon_private.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'
);

alter table public.teams enable row level security;
alter table public.memberships enable row level security;
create function tugon_private.session_is_current()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = (select auth.uid())
      and s.id::text = (select auth.jwt()->>'session_id')
      and (s.not_after is null or s.not_after > now())
  )
$$;
revoke all on function tugon_private.session_is_current() from public, anon, authenticated;
grant execute on function tugon_private.session_is_current() to authenticated;

alter table public.resident_profiles enable row level security;
alter table tugon_private.audit_log enable row level security;

revoke all on public.teams, public.memberships, public.resident_profiles from public, anon, authenticated;
grant select on public.teams, public.memberships, public.resident_profiles to authenticated;

create policy membership_read_self on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) and active and (select tugon_private.session_is_current()));

create policy resident_read_self on public.resident_profiles for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.memberships m where m.user_id = resident_profiles.user_id and m.role = 'resident'
  ));

create policy team_read_staff on public.teams for select to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2' and exists (
    select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.role in ('intake', 'handler', 'supervisor', 'admin')
  ));

create function public.complete_resident_profile(p_name text, p_purok text, p_lang text, p_consented boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not tugon_private.session_is_current() or not exists (
    select 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null
  ) then
    raise exception 'Verified email is required' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_lang is null or p_lang not in ('fil', 'en')
     or p_purok is null or p_purok !~ '^P[1-5]$' or p_consented is distinct from true then
    raise exception 'Invalid profile details' using errcode = '22023';
  end if;
  insert into public.memberships (user_id, role, name) values (actor, 'resident', trim(p_name))
    on conflict (user_id) do nothing;
  if not exists (select 1 from public.memberships m where m.user_id = actor and m.role = 'resident' and m.active) then
    raise exception 'Resident membership is unavailable' using errcode = '42501';
  end if;
  insert into public.resident_profiles (user_id, purok, lang, notice_version)
    values (actor, p_purok, p_lang, '2026-11-pilot') on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.complete_resident_profile(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_resident_profile(text, text, text, boolean) to authenticated;

commit;
