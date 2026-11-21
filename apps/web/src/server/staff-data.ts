import "server-only";
import { cache } from "react";
import { MODEL_CARD, suggest } from "@/lib/classifier";
import type { Category, CaseEvent, EventType, LocationInfo, Prediction, Role, Staff, Team, Urgency } from "@/lib/domain";
import type { Database } from "@/lib/database.types";
import type { DeskSnapshot, StaffRequest } from "@/lib/snapshot";
import { projectAssignment } from "./field-data";
import { portalIdentity } from "./identity";
import { readIncidents } from "./incident-data";
import { readLupon } from "./lupon-data";
import { publicSettings } from "./resident-data";
import { readOfficers, readRoster } from "./roster-data";
import { requestAuth } from "./supabase";

type Tables = Database["public"]["Tables"];
type CaseRow = Tables["service_requests"]["Row"] & {
  case_work: Tables["case_work"]["Row"] | null;
  internal_case_events: Tables["internal_case_events"]["Row"][];
  resident_request_events: Tables["resident_request_events"]["Row"][];
};
const ts = (value: string | null | undefined) => value ? Date.parse(value) : null;
export const MODEL_VERSION = "tfidf-nb-1";

function project(row: CaseRow): StaffRequest {
  const w = row.case_work;
  const prediction = (w?.prediction as unknown as Prediction | null) ?? suggest(row.description);
  const events: CaseEvent[] = row.internal_case_events.map((e) => ({
    id: e.id, at: Date.parse(e.created_at), type: e.event_type as EventType, vis: "internal",
    actor: { kind: "staff", id: e.actor_id, name: e.actor_name }, ...(e.message ? { text: e.message } : {}),
  }));
  for (const e of row.resident_request_events) {
    events.push({
      id: e.id, at: Date.parse(e.created_at), type: e.event_type as EventType, vis: "resident",
      actor: { kind: e.author as CaseEvent["actor"]["kind"], name: e.author === "resident" ? "Resident" : "Barangay" },
      ...(e.message ? { text: e.message } : {}),
    });
  }
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return {
    id: row.id, ref: row.ref, residentId: row.resident_id,
    contact: w?.contact_name ? { name: w.contact_name, phone: w.contact_phone ?? undefined, sms: w.contact_opt_in } : null,
    channel: row.channel as StaffRequest["channel"], text: row.description, residentCategory: row.resident_category as Category | null,
    dangerNow: row.danger_now, location: row.location as LocationInfo | null, hasPhoto: row.has_photo,
    createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at), status: row.status as StaffRequest["status"],
    prediction, triage: row.category && w?.urgency && w.triaged_at && w.triaged_by ? {
      category: row.category as Category, urgency: w.urgency as Urgency, by: w.triaged_by, at: Date.parse(w.triaged_at),
      correctedCategory: row.category !== prediction.category, correctedUrgency: w.urgency !== prediction.urgency,
    } : null,
    team: w?.team_id ?? null, assigneeId: w?.assignee_id ?? null, restricted: w?.restricted ?? false,
    duplicateOf: w?.duplicate_of ?? null, referral: row.referral_office ? { office: row.referral_office } : null,
    outcome: row.outcome, outcomePhoto: row.outcome_photo, firstActionAt: ts(w?.first_action_at), startedAt: ts(w?.started_at),
    closedAt: ts(row.closed_at), followUp: row.follow_up, events, idemKey: null, incidentId: w?.incident_id ?? null, anonymizedAt: ts(row.anonymized_at), redacted: false,
  };
}

const columns = "*, case_work!case_work_request_id_fkey(*), internal_case_events(*), resident_request_events(*)";
const incidentColumns = "*, case_work!case_work_request_id_fkey!inner(*), internal_case_events(*), resident_request_events(*)";
export const staffSnapshot = cache(async (incidentId?: string): Promise<DeskSnapshot | null> => {
  const identity = await portalIdentity("staff");
  if (!identity) return null;
  const client = await requestAuth();
  const focus = identity.member.role === "intake" || identity.member.role === "supervisor" ? incidentId : undefined;
  const linkedReports = async () => {
    const reports: CaseRow[] = [];
    if (!focus) return reports;
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await client.from("service_requests").select(incidentColumns)
        .eq("case_work.incident_id", focus).eq("case_work.restricted", false).order("id").range(offset, offset + 249);
      if (error) throw new Error("Unable to read linked reports", { cause: error.code });
      reports.push(...data);
      if (data.length < 250) return reports;
    }
  };
  const [settings, targets, offices, teamRows, names, rows, officers, roster, field, kp, incidents, linked] = await Promise.all([
    publicSettings(), client.from("civic_settings").select("target_high,target_medium,target_normal,lupon_enabled").single(),
    client.from("referral_offices").select("id,name,scope,contact").order("name"),
    client.from("teams").select("id,name,category").order("name"),
    client.from("memberships").select("user_id,name,role,active,team_id,title").in("role", ["handler", "intake", "supervisor", "admin"]).order("name"),
    client.from("service_requests").select(columns).order("updated_at", { ascending: false }).order("id").limit(250),
    readOfficers(), readRoster(), client.from("field_assignments").select("*").order("assigned_at", { ascending: false }).limit(250),
    readLupon(),
    readIncidents(focus), linkedReports(),
  ]);
  const issue = targets.error ?? offices.error ?? teamRows.error ?? names.error ?? rows.error ?? field.error;
  if (issue || !targets.data || !offices.data || !teamRows.data || !names.data || !rows.data || !field.data) throw new Error("Unable to read desk workspace", { cause: issue?.code });
  const me: Staff = { id: identity.subject, name: identity.member.name, email: identity.email ?? "", role: identity.member.role as Role, team: identity.member.team_id, active: true, title: identity.member.title };
  const staff: Staff[] = names.data.filter((row) => row.user_id !== me.id).map((row) => ({ id: row.user_id, name: row.name, role: row.role as Role, team: row.team_id, active: row.active, title: row.title, email: "" }));
  const teams = teamRows.data.filter((row) => row.category) as Team[];
  const reports = new Map(rows.data.map((row) => [row.id, row]));
  for (const row of linked) reports.set(row.id, row);
  return {
    rev: Date.now(), now: Date.now(), me, staff: [me, ...staff, ...officers], teams, roster,
    incidents, kp, assignments: field.data.map((row) => ({ ...projectAssignment(row), redacted: false })),
    requests: Array.from(reports.values(), project), model: MODEL_CARD, residents: {},
    settings: { ...settings, targets: { high: targets.data.target_high, medium: targets.data.target_medium, normal: targets.data.target_normal }, referrals: offices.data, luponEnabled: targets.data.lupon_enabled },
  };
});

export async function readStaffCase(id: string) {
  const client = await requestAuth();
  const [{ data, error }, reporter] = await Promise.all([
    client.from("service_requests").select(columns).eq("id", id).maybeSingle(),
    client.rpc("case_reporter", { p_id: id }).maybeSingle(),
  ]);
  if (error || reporter.error) throw new Error("Unable to read case", { cause: error?.code ?? reporter.error?.code });
  return data ? { report: project(data), reporter: reporter.data } : null;
}
