begin;
-- Application analytics and field-photo routes first enforce the caller role and
-- assignment; the service connection itself can read only this projection.
grant select(id,name) on public.teams to service_role;
grant select(target_high,target_medium,target_normal,hotspot_radius,hotspot_minimum) on public.civic_settings to service_role;
grant select(id,request_id,status,assigned_at,arrived_at) on public.field_assignments to service_role;
grant select(id,channel,category,resident_category,created_at,closed_at,status,location,has_photo,submission_key,resident_id) on public.service_requests to service_role;
grant select(request_id,restricted,prediction,urgency,triaged_at,first_action_at,started_at,team_id,assignee_id,incident_id) on public.case_work to service_role;
grant select(stage,filed_at,closed_at) on public.lupon_cases to service_role;
grant select(id,created_at,closed_at) on public.incidents to service_role;
grant select(incident_id) on public.incident_updates to service_role;
commit;
