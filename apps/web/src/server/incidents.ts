"use server";

import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { requestAuth } from "./supabase";

export async function createIncident(input: { title: string; requestIds: string[] }) {
  if (!Array.isArray(input.requestIds) || input.requestIds.some((id) => !isUUID(id))) return failure("invalid", "Select eligible reports.");
  const db = await requestAuth();
  const { data, error } = await db.rpc("start_incident", { p_title: input.title, p_requests: input.requestIds });
  return error ? failure("invalid", error.code === "22023" ? error.message : "Unable to start the incident.") : success({ id: data });
}

async function change(id: string, action: string, request?: string, message?: string) {
  if (!isUUID(id) || (request !== undefined && !isUUID(request))) return failure("invalid", "Incident unavailable.");
  const db = await requestAuth();
  const { data, error } = await db.rpc("change_incident", { p_id: id, p_action: action, p_request: request, p_message: message });
  if (error) return failure("invalid", error.code === "22023" ? error.message : "Unable to update the incident.");
  const count = (data ?? {}) as { reached?: number; resolved?: number; leftOpen?: number };
  return success({ reached: count.reached ?? 0, resolved: count.resolved ?? 0, left: count.leftOpen ?? 0 });
}

export async function linkToIncident(input: { incidentId: string; requestId: string }) { return change(input.incidentId, "link", input.requestId); }
export async function unlinkFromIncident(input: { incidentId: string; requestId: string }) { return change(input.incidentId, "unlink", input.requestId); }
export async function postIncidentUpdate(input: { incidentId: string; text: string }) { return change(input.incidentId, "broadcast", undefined, input.text); }
export async function closeIncident(input: { incidentId: string; outcome: string }) { return change(input.incidentId, "close", undefined, input.outcome); }
