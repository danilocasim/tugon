"use server";

import type { Json } from "@/lib/database.types";
import type { KpHearingResult, KpStage } from "@/lib/domain";
import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

const denied = () => failure("forbidden", "This Lupon case is not available. Check your role and pilot configuration.");
async function change(id: string, step: string, value: Json = {}) {
  if (!isUUID(id) || !(await portalIdentity("staff"))) return denied();
  const db = await requestAuth();
  const { data, error } = await db.rpc("change_lupon_case", { p_id: id, p_action: step, p_value: value });
  if (error?.code === "42501") return denied();
  return error ? failure("invalid", error.code === "22023" ? error.message : "Unable to update this proceeding.") : success({ stage: data as KpStage });
}

export async function fileKpCase(input: { requestId: string; complainant: string; respondent: string; respondentAddress: string; nature: string; confirmed: boolean }) {
  if (!isUUID(input?.requestId) || !(await portalIdentity("staff"))) return denied();
  const db = await requestAuth();
  const { data, error } = await db.rpc("file_lupon_case", { p_request: input.requestId, p_complainant: input.complainant, p_respondent: input.respondent, p_address: input.respondentAddress, p_nature: input.nature, p_confirmed: input.confirmed }).single();
  if (error?.code === "42501") return denied();
  return error || !data ? failure("invalid", "Verify eligibility and ensure there is no open proceeding for this request.") : success(data);
}
export async function scheduleHearing(input: { kpId: string; at: number }) {
  if (!Number.isFinite(input.at) || Math.abs(input.at) > 8.64e15) return failure("invalid", "Choose the hearing date and time.");
  return change(input.kpId, "schedule", { at: new Date(input.at).toISOString() });
}
export async function markSummonsServed(input: { kpId: string; hearingId: string }) { return change(input.kpId, "served", { hearing: input.hearingId }); }
export async function recordHearing(input: { kpId: string; hearingId: string; result: KpHearingResult; notes: string; settlement?: string }) {
  return change(input.kpId, "record", { hearing: input.hearingId, result: input.result, notes: input.notes, settlement: input.settlement });
}
export async function extendConciliation(input: { kpId: string }) { return change(input.kpId, "extend"); }
export async function closeKpCase(input: { kpId: string; outcome: "cfa" | "dismissed" | "withdrawn"; note: string }) {
  return change(input.kpId, "close", { outcome: input.outcome, notes: input.note });
}
