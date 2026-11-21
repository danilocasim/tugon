-- The Insights projection excludes reports already linked to an incident.
grant select(incident_id) on public.case_work to service_role;
