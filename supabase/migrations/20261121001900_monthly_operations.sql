begin;
create function public.report_operations(p_start timestamptz,p_end timestamptz)
returns table(field_sent bigint,field_done bigint,field_cancelled bigint,median_arrival_ms double precision,lupon_filed bigint,lupon_pending bigint,
  lupon_settled bigint,lupon_cfa bigint,lupon_dismissed bigint,lupon_withdrawn bigint,incident_started bigint,incident_closed bigint,incident_linked bigint,incident_updates bigint)
language sql stable security definer set search_path='' as $$
  with field as (select a.status,extract(epoch from (a.arrived_at-a.assigned_at))::double precision*1000 as lag from public.field_assignments a
    where a.assigned_at>=p_start and a.assigned_at<p_end),
  law as (select k.stage,k.filed_at,k.closed_at from public.lupon_cases k where k.filed_at<p_end and (k.closed_at is null or k.closed_at>=p_start)),
  inc as (select i.id,i.closed_at from public.incidents i where i.created_at>=p_start and i.created_at<p_end)
  select (select count(*) from field), (select count(*) from field where status='done'),
    (select count(*) from field where status in ('declined','cancelled')), (select percentile_cont(0.5) within group(order by lag) from field),
    (select count(*) from law where filed_at>=p_start), (select count(*) from law where closed_at is null or closed_at>=p_end),
    (select count(*) from law where stage='settled' and closed_at<p_end),(select count(*) from law where stage='cfa' and closed_at<p_end),
    (select count(*) from law where stage='dismissed' and closed_at<p_end),(select count(*) from law where stage='withdrawn' and closed_at<p_end),
    (select count(*) from inc), (select count(*) from public.incidents where closed_at>=p_start and closed_at<p_end),
    (select count(*) from public.case_work w join inc i on i.id=w.incident_id where not w.restricted),
    (select count(*) from public.incident_updates u where u.created_at>=p_start and u.created_at<p_end);
$$;
revoke all on function public.report_operations(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.report_operations(timestamptz,timestamptz) to service_role;
revoke select(id,request_id,status,assigned_at,arrived_at) on public.field_assignments from service_role;
revoke select(stage,filed_at,closed_at) on public.lupon_cases from service_role;
revoke select(id,created_at,closed_at) on public.incidents from service_role;
revoke select(incident_id) on public.incident_updates from service_role;
revoke select(incident_id) on public.case_work from service_role;
commit;
