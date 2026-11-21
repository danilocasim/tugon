begin;
create function public.report_duty_totals(p_start date,p_end date)
returns table(day_count bigint,night_count bigint)
language sql stable security definer set search_path='' as $$
  select count(*) filter(where r.shift='day'),count(*) filter(where r.shift='night')
  from public.duty_roster r where r.local_date>=p_start and r.local_date<p_end;
$$;
revoke all on function public.report_duty_totals(date,date) from public,anon,authenticated;
grant execute on function public.report_duty_totals(date,date) to service_role;

create or replace function public.report_months()
returns table(month text) language sql stable security definer set search_path='' as $$
  select to_char(created_at at time zone 'Asia/Manila','YYYY-MM') from public.service_requests
  union select to_char(local_date,'YYYY-MM') from public.duty_roster where local_date<date_trunc('month',now() at time zone 'Asia/Manila')+interval '1 month'
  union select to_char(now() at time zone 'Asia/Manila','YYYY-MM') order by 1 desc;
$$;
commit;
