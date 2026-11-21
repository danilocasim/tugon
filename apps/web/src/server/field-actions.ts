"use server";

import { failure, success } from "@/lib/result";
import type { FieldResult } from "@/lib/domain";
import { isUUID } from "@/lib/uuid";
import { evidenceBucket, sanitizeReportPhoto } from "./evidence";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

const denied = () => failure("not_found", "This assignment isn't available to your role.");
export async function assignTanod(input: { id: string; tanodId: string; instructions?: string }) {
  if (!isUUID(input?.id) || !isUUID(input.tanodId) || !(await portalIdentity("staff"))) return denied();
  const client = await requestAuth();
  const { data, error } = await client.rpc("dispatch_tanod", { p_id: input.id, p_officer: input.tanodId, p_instructions: input.instructions });
  return error ? failure("field", error.code === "23505" ? "This officer is already assigned to the case." : "The case cannot be dispatched or the officer is not on duty.") : success({ id: data });
}

async function change(assignment: string, action: string, message?: string, result?: FieldResult, photo = false) {
  const client = await requestAuth();
  const { error } = await client.rpc("change_field_assignment", { p_id: assignment, p_action: action, p_message: message, p_result: result, p_photo: photo });
  if (error?.code === "42501") return denied();
  return error ? failure("field", "The assignment changed or the required information is missing. Refresh and check it again.") : success(null);
}

export async function cancelTanodAssignment(input: { assignmentId: string; reason: string }) {
  if (!isUUID(input?.assignmentId) || !(await portalIdentity("staff"))) return denied();
  return change(input.assignmentId, "cancel", input.reason);
}

export async function respondToAssignment(input: { id: string; action: "accept" | "arrive" | "decline"; reason?: string }) {
  if (!isUUID(input?.id) || !["accept", "arrive", "decline"].includes(input.action) || !(await portalIdentity("tanod"))) return denied();
  return change(input.id, input.action, input.reason);
}

export async function fileFieldReport(input: { id: string; result: FieldResult; report: string; photo?: string | null }) {
  const actor = await portalIdentity("tanod");
  if (!actor || !isUUID(input?.id)) return denied();
  const photo = input.photo != null;
  if (photo) {
    const client = await requestAuth();
    const { data } = await client.from("field_assignments").select("status").eq("id", input.id).eq("tanod_id", actor.subject).maybeSingle();
    if (data?.status !== "on_scene") return denied();
    const jpeg = await sanitizeReportPhoto(input.photo);
    if (!jpeg) return failure("invalid", "Choose a valid photo or remove it before retrying.");
    const path = `field/${input.id}.jpg`;
    const bucket = evidenceBucket();
    const { error } = await bucket.upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error && (await bucket.info(path)).error) return failure("network", "Could not confirm the photo upload. Try again.");
  }
  return change(input.id, "report", input.report, input.result, photo);
}
