"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { suggest } from "@/lib/classifier";
import type { Json } from "@/lib/database.types";
import { type Category, type Urgency } from "@/lib/domain";
import { normalizeMobile } from "@/lib/duty";
import { failure, success, type Result } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { evidenceBucket, sanitizeReportPhoto } from "./evidence";
import { portalIdentity } from "./identity";
import { serviceClient } from "./service-client";
import { MODEL_VERSION, readStaffCase } from "./staff-data";
import { requestAuth } from "./supabase";

const deny = () => failure("not_found", "This case is not available for your role.");

async function classify(id: string, text: string) {
  const prediction = suggest(text);
  const { error } = await serviceClient().rpc("save_case_prediction", { p_case: id, p_prediction: { ...prediction }, p_version: MODEL_VERSION });
  return !error;
}

async function change(id: unknown, action: string, input: Json = {}): Promise<Result> {
  const actor = await portalIdentity("staff");
  if (!actor || !isUUID(id) || actor.member.role === "admin") return deny();
  const client = await requestAuth();
  if (["review", "triage", "retriage"].includes(action)) {
    if (actor.member.role !== "intake" && actor.member.role !== "supervisor") return deny();
    const row = await readStaffCase(id);
    if (!row) return deny();
    if (!(await classify(id, row.report.text))) return failure("server", "Could not save the model suggestion.");
  }
  const { error } = await client.rpc("change_case", { p_id: id, p_action: action, p_input: input });
  if (error?.code === "42501") return deny();
  if (error?.code === "P4001") return { ok: false, code: "reason_required", message: error.message, meta: { skipped: Number(error.details) || 1 } };
  if (error?.code === "22023") return failure("invalid", error.message);
  if (error) return failure("network", "We could not save the change. Refresh the case before trying again.");
  revalidatePath(`/barangay/cases/${id}`);
  return success(null);
}

export async function startReview(input: { id: string }) { return change(input?.id, "review"); }
export async function startWork(input: { id: string }) { return change(input?.id, "start"); }
export async function askForInfo(input: { id: string; message: string }) { return change(input?.id, "ask", { message: input?.message }); }
export async function triageRequest(input: { id: string; category: Category; urgency: Urgency; restricted: boolean; note?: string }) {
  return change(input?.id, "triage", { category: input?.category, urgency: input?.urgency, restricted: input?.restricted, reason: input?.note });
}
export async function changeTriage(input: { id: string; category: Category; urgency: Urgency; reason: string }) {
  return change(input?.id, "retriage", { category: input?.category, urgency: input?.urgency, reason: input?.reason });
}
export async function referRequest(input: { id: string; office: string; message: string }) {
  if (!isUUID(input?.office)) return failure("invalid", "Choose a configured referral office.");
  const client = await requestAuth();
  const { data } = await client.from("referral_offices").select("name").eq("id", input.office).maybeSingle();
  return data ? change(input.id, "refer", { office: data.name, message: input.message }) : failure("invalid", "Referral office not found.");
}
export async function markDuplicate(input: { id: string; originalId: string }) {
  if (!isUUID(input?.originalId)) return failure("invalid", "Choose the original request.");
  return change(input?.id, "duplicate", { original: input.originalId });
}
export async function claimRequest(input: { id: string; reason?: string }): Promise<Result> {
  return change(input?.id, "claim", { reason: input?.reason });
}
export async function assignRequest(input: { id: string; assigneeId: string; reason: string }) {
  if (!isUUID(input?.assigneeId)) return failure("invalid", "Choose an eligible assignee.");
  return change(input.id, "assign", { assignee: input.assigneeId, reason: input.reason });
}
export async function postUpdate(input: { id: string; text: string; vis: "resident" | "internal" }) {
  if (input?.vis !== "resident" && input?.vis !== "internal") return failure("invalid", "Choose who can see this update.");
  return change(input.id, input.vis === "internal" ? "note" : "update", { message: input.text });
}
export async function resolveRequest(input: { id: string; outcome: string; photo?: string | null; fieldProof?: string }) {
  const identity = await portalIdentity("staff");
  if (!identity || !isUUID(input?.id)) return deny();
  if (typeof input.outcome !== "string" || input.outcome.trim().length < 10 || input.outcome.trim().length > 1500 ||
    (input.fieldProof !== undefined && (!isUUID(input.fieldProof) || input.photo))) return failure("invalid", "Choose one proof photo and enter an outcome.");
  const row = await readStaffCase(input.id);
  if (!row || row.report.status !== "in_progress" || (row.report.assigneeId !== identity.subject && identity.member.role !== "supervisor")) return deny();
  let key;
  if (input.photo) {
    const jpeg = await sanitizeReportPhoto(input.photo);
    if (!jpeg) return failure("invalid", "Choose a valid JPEG photo under 600 KB, or remove the photo.");
    key = `outcome/${input.id}/${randomUUID()}.jpg`;
    const { error } = await evidenceBucket().upload(key, jpeg, { contentType: "image/jpeg" });
    if (error) return failure("network", "We could not save the resolution photo.");
  }
  const client = await requestAuth();
  const { error } = await client.rpc("publish_case_resolution", { p_id: input.id, p_message: input.outcome.trim(), p_object: key, p_field: input.fieldProof });
  if (error?.code === "42501") return deny();
  if (error?.code === "22023") return failure("invalid", error.message);
  if (error) return failure("network", "We could not confirm the outcome. Refresh the case before trying again.");
  revalidatePath(`/barangay/cases/${input.id}`);
  return success(null);
}
export async function reopenRequest(input: { id: string; reason: string }) { return change(input?.id, "reopen", { reason: input?.reason }); }
export async function setRestricted(input: { id: string; restricted: boolean; reason: string }) {
  return change(input?.id, "restricted", { restricted: input?.restricted, reason: input?.reason });
}

export async function createAssistedRequest(input: {
  channel: "walkin" | "phone"; name: string; phone?: string | null; sms: boolean; text: string;
  residentCategory: Category | null; dangerNow: boolean; location?: { [key: string]: Json | undefined } | null; note?: string;
}) {
  const actor = await portalIdentity("staff");
  if (!actor || !["intake", "supervisor"].includes(actor.member.role)) return deny();
  if (!input || typeof input.name !== "string") return failure("invalid", "Check the assisted request fields.");
  if (input?.phone && (typeof input.phone !== "string" || !normalizeMobile(input.phone))) return failure("invalid", "Enter a valid mobile number.");
  const client = await requestAuth();
  const { data, error } = await client.rpc("submit_assisted_request", {
    p_channel: input.channel, p_description: input.text, p_category: input.residentCategory!, p_danger: input.dangerNow,
    p_location: input.location ?? null, p_name: input.name.trim() || "Anonymous", p_phone: normalizeMobile(input.phone)!, p_sms: input.sms, p_note: input.note ?? "",
  }).single();
  return error || !data ? failure("invalid", "Check the assisted request fields and try again.") : success(data);
}
