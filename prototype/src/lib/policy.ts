/**
 * Central authorization policy. Deny by default. The server enforces every
 * check; the UI uses the same rules only to decide which controls to show.
 */
import { INTAKE_STATUSES, type Role, type ServiceRequest, type Staff } from "./domain";

export type Area = "inbox" | "queue" | "mine" | "case" | "insights" | "admin" | "intake" | "tanods" | "incidents" | "lupon" | "reports";

// Tanods have no desk areas: they work from the separate Tanod app with their own session.
// The barangay secretary (intake) keeps the Lupon docket and prepares the monthly report.
const AREAS: Record<Role, Area[]> = {
  intake: ["inbox", "queue", "case", "intake", "tanods", "incidents", "lupon", "reports"],
  handler: ["queue", "mine", "case", "tanods", "lupon"],
  supervisor: ["inbox", "queue", "mine", "case", "insights", "intake", "tanods", "incidents", "lupon", "reports"],
  admin: ["insights", "admin", "tanods", "reports"],
  tanod: [],
};

export function canAccess(s: Staff | null | undefined, area: Area) {
  if (!s?.active || !AREAS[s.role].includes(area)) return false;
  // Only the Peace & Order handler works Lupon cases; other teams never see them.
  return area !== "lupon" || s.role !== "handler" || s.team === "t_peace";
}

/** Adding tanods and editing the duty roster: the peace-and-order chain plus administrators. */
export const canManageTanods = (s: Staff | null | undefined) => !!s?.active && (s.role === "supervisor" || s.role === "admin");

export type CaseAction = "view" | "triage" | "claim" | "assign" | "work" | "note" | "reopen" | "retriage" | "dispatch";

type Case = Pick<ServiceRequest, "status" | "restricted" | "team" | "assigneeId" | "dangerNow">;

export function can(s: Staff | null | undefined, action: CaseAction, r: Case): boolean {
  if (!s?.active || s.role === "admin" || s.role === "tanod") return false;
  const supervisor = s.role === "supervisor";
  const assignee = r.assigneeId === s.id;

  const view = r.restricted
    ? supervisor || assignee || (s.role === "intake" && INTAKE_STATUSES.includes(r.status))
    : s.role === "handler"
      ? r.team === s.team || assignee
      : true;
  if (!view) return false;

  switch (action) {
    case "view":
    case "note":
      return true;
    case "triage":
      return (s.role === "intake" || supervisor) && INTAKE_STATUSES.includes(r.status);
    case "claim":
      return r.status === "queued" && !r.assigneeId && (supervisor || (s.role === "handler" && r.team === s.team));
    case "assign":
      return supervisor && (r.status === "queued" || r.status === "in_progress");
    case "work":
      return (assignee || supervisor) && (r.status === "queued" || r.status === "in_progress");
    case "retriage":
      return (s.role === "intake" || supervisor) && (r.status === "queued" || r.status === "in_progress");
    case "reopen":
      return supervisor && (r.status === "resolved" || r.status === "referred");
    // Sending a tanod: whoever owns the work, plus intake when a resident flags danger before routing.
    case "dispatch":
      return (
        (supervisor && (INTAKE_STATUSES.includes(r.status) || r.status === "queued" || r.status === "in_progress")) ||
        (s.role === "handler" && (r.team === s.team || assignee) && (r.status === "queued" || r.status === "in_progress")) ||
        (s.role === "intake" && r.dangerNow && INTAKE_STATUSES.includes(r.status))
      );
  }
}
