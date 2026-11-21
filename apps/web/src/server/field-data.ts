import "server-only";
import { cache } from "react";
import type { Database } from "@/lib/database.types";
import type { FieldAssignment, FieldResult, FieldStatus, Shift } from "@/lib/domain";
import type { TanodCase, TanodSnapshot } from "@/lib/snapshot";
import { portalIdentity } from "./identity";
import { publicSettings } from "./resident-data";
import { officer, readRoster } from "./roster-data";
import { requestAuth } from "./supabase";

type FieldRow = Database["public"]["Tables"]["field_assignments"]["Row"];
const ts = (value: string | null) => value ? Date.parse(value) : null;
export function projectAssignment(row: FieldRow): FieldAssignment {
  return {
    id: row.id, requestId: row.request_id, tanodId: row.tanod_id, assignedBy: row.sent_by, instructions: row.instructions || null,
    assignedAt: Date.parse(row.assigned_at), acceptedAt: ts(row.accepted_at), arrivedAt: ts(row.arrived_at), closedAt: ts(row.closed_at),
    closeReason: row.close_reason, status: row.status as FieldStatus, hasPhoto: row.has_photo, report: row.report, result: row.result as FieldResult | null,
  };
}

export const tanodSnapshot = cache(async (): Promise<TanodSnapshot | null> => {
  const actor = await portalIdentity("tanod");
  if (!actor) return null;
  const client = await requestAuth();
  const [settings, shifts, assignments, partners] = await Promise.all([
    publicSettings(), readRoster(actor.member), client.rpc("my_field_cases"), client.rpc("tanod_on_duty_partners"),
  ]);
  if (assignments.error || partners.error) throw new Error("Unable to read field work", { cause: assignments.error?.code ?? partners.error?.code });
  return {
    now: Date.now(), rev: Date.now(), me: officer(actor.member), settings, shifts,
    assignments: assignments.data.map((row) => ({ ...projectAssignment(row.assignment as unknown as FieldRow), case: row.linked_case as unknown as TanodCase, assignedByName: row.sender })),
    onDuty: partners.data.map((row) => ({ id: row.id, name: row.name, phone: row.phone?.replace(/^\+63/u, "0") ?? null, zone: row.zone, shift: row.shift as Shift })),
  };
});
