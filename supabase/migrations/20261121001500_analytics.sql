begin;
alter table public.civic_settings add column hotspot_radius integer not null default 100 check(hotspot_radius between 40 and 250),
  add column hotspot_minimum integer not null default 4 check(hotspot_minimum between 3 and 10);
create index request_analytics_created on public.service_requests(created_at,id);
create index request_analytics_closed on public.service_requests(closed_at,id) where closed_at is not null;

create function public.update_hotspot_settings(p_radius integer,p_minimum integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(tugon_private.desk_role(),'') not in ('admin','supervisor') then raise exception 'Insights unavailable' using errcode='42501'; end if;
  update public.civic_settings set hotspot_radius=p_radius,hotspot_minimum=p_minimum where singleton;
  insert into tugon_private.audit_log(actor_id,action) values(auth.uid(),'hotspot_settings_changed');
end;
$$;
revoke all on function public.update_hotspot_settings(integer,integer) from public,anon,authenticated;
grant execute on function public.update_hotspot_settings(integer,integer) to authenticated;

create function public.report_months()
returns table(month text) language sql stable security definer set search_path='' as $$
  select distinct to_char(created_at at time zone 'Asia/Manila','YYYY-MM') from public.service_requests
  union select to_char(now() at time zone 'Asia/Manila','YYYY-MM') order by 1 desc;
$$;
create function public.report_delivery_count(p_start timestamptz,p_end timestamptz)
returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer from tugon_private.delivery_outbox where channel='sms' and state='accepted' and ended_at>=p_start and ended_at<p_end;
$$;
revoke all on function public.report_months(),public.report_delivery_count(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.report_months(),public.report_delivery_count(timestamptz,timestamptz) to service_role;
commit;
