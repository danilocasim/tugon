begin;

create table public.civic_settings (
  singleton boolean primary key default true check (singleton),
  barangay text not null,
  city text not null default '',
  hall_address text not null default '',
  office_hours text not null default '',
  intake_hours text not null default '',
  hotline text not null default '',
  emergency text not null default '911',
  retention_months integer not null default 24 check (retention_months between 1 and 120),
  dpo_name text not null default '',
  dpo_email text not null default '',
  dpo_phone text not null default ''
);
insert into public.civic_settings (barangay) values ('Barangay service desk');
alter table public.civic_settings enable row level security;
revoke all on public.civic_settings from public, anon, authenticated;
grant select on public.civic_settings to anon, authenticated;
create policy public_civic_settings on public.civic_settings for select to anon, authenticated using (true);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  resident_id uuid references public.memberships(user_id) on delete set null,
  channel text not null check (channel in ('online', 'walkin', 'phone')),
  description text not null check (char_length(description) <= 1000),
  resident_category text check (resident_category in ('peace', 'infra', 'sanitation', 'documents', 'social')),
  danger_now boolean not null default false,
  location jsonb,
  has_photo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received', 'review', 'needs_info', 'queued', 'in_progress', 'resolved', 'referred', 'duplicate', 'withdrawn')),
  category text check (category in ('peace', 'infra', 'sanitation', 'documents', 'social')),
  team_name text,
  referral_office text,
  duplicate_of_ref text,
  outcome text,
  outcome_photo boolean not null default false,
  follow_up boolean not null default false,
  closed_at timestamptz
);
create index resident_requests_recent on public.service_requests(resident_id, updated_at desc, id);

create table public.resident_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  author text not null check (author in ('resident', 'staff', 'system')),
  message text
);
create index resident_request_events_case on public.resident_request_events(request_id, created_at, id);

create table public.resident_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  resident_id uuid not null references public.memberships(user_id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_resident_recent on public.resident_notifications(resident_id, created_at desc, id);

alter table public.service_requests enable row level security;
alter table public.resident_request_events enable row level security;
alter table public.resident_notifications enable row level security;
revoke all on public.service_requests, public.resident_request_events, public.resident_notifications from public, anon, authenticated;
grant select on public.service_requests, public.resident_request_events, public.resident_notifications to authenticated;

create policy owner_request_read on public.service_requests for select to authenticated
  using (resident_id = (select auth.uid()) and exists (
    select 1 from public.memberships m where m.user_id = service_requests.resident_id and m.role = 'resident'
  ));
create policy owner_event_read on public.resident_request_events for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = resident_request_events.request_id));
create policy owner_notification_read on public.resident_notifications for select to authenticated
  using (resident_id = (select auth.uid()) and exists (
    select 1 from public.service_requests r where r.id = resident_notifications.request_id
  ));

grant update (lang) on public.resident_profiles to authenticated;
create policy resident_language_self on public.resident_profiles for update to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.memberships m where m.user_id = resident_profiles.user_id and m.role = 'resident'
  ))
  with check (user_id = (select auth.uid()));

commit;
