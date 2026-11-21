"use server";

import { revalidatePath } from "next/cache";
import { isDate, normalizeMobile } from "@/lib/duty";
import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { portalIdentity } from "./identity";
import { serviceClient } from "./service-client";
import { requestAuth } from "./supabase";

const denied = () => failure("forbidden", "Only supervisors and administrators can edit the roster.");
const validDate = (value: unknown) => isDate(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
async function rosterEditor() {
  const actor = await portalIdentity("staff");
  return actor && (actor.member.role === "admin" || actor.member.role === "supervisor") ? actor : null;
}
function onSaved<T>(value: T) {
  revalidatePath("/barangay/tanods");
  revalidatePath("/tanod", "layout");
  return success(value);
}

export async function setDuty(input: { tanodId: string; date: string; shift: "day" | "night"; on: boolean }) {
  if (!isUUID(input?.tanodId) || !validDate(input.date) || !["day", "night"].includes(input.shift) || typeof input.on !== "boolean") return failure("invalid", "Choose a valid shift and officer.");
  if (!(await rosterEditor())) return denied();
  const db = await requestAuth();
  const { error } = await db.rpc("change_officer_duty", { p_officer: input.tanodId, p_date: input.date, p_shift: input.shift, p_on: input.on });
  return error ? failure("roster", "This shift could not be saved. Check that the officer is active and the date is editable.") : onSaved(null);
}

export async function copyPreviousWeek(input: { weekStart: string }) {
  if (!validDate(input?.weekStart)) return failure("invalid", "Choose the week to fill.");
  if (!(await rosterEditor())) return denied();
  const db = await requestAuth();
  const { data, error } = await db.rpc("copy_duty_week", { p_monday: input.weekStart });
  return error ? failure("roster", "The selected week could not be copied.") : onSaved({ added: data });
}

export async function setStaffActive(input: { id: string; active: boolean }) {
  if (!isUUID(input?.id) || typeof input.active !== "boolean") return failure("invalid", "Choose an officer.");
  if (!(await rosterEditor())) return denied();
  const db = await requestAuth();
  const { error } = await db.rpc("set_officer_active", { p_officer: input.id, p_active: input.active });
  return error ? failure("roster", "The officer's status could not be saved.") : onSaved(null);
}

export async function addTanod(input: { name: string; phone: string; zone: string }) {
  const actor = await rosterEditor();
  if (!actor) return denied();
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const local = typeof input?.phone === "string" && input.phone.length <= 32 ? normalizeMobile(input.phone) : null;
  if (name.length < 2 || name.length > 100 || !local || typeof input.zone !== "string" || !/^P[1-5]$/u.test(input.zone)) return failure("invalid", "Enter the officer's name, Philippine mobile number and purok.");
  const phone = `+63${local.slice(1)}`;
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: false });
  if (error || !data.user) return failure("roster", "Could not create this officer. Check whether the number is already registered.");
  const { error: dbError } = await admin.rpc("register_officer", { p_actor: actor.subject, p_user: data.user.id, p_name: name, p_phone: phone, p_zone: input.zone });
  if (dbError) {
    // Do not delete on an ambiguous response: the membership may already have committed.
    return failure("roster", "Officer setup could not be confirmed. Check the roster before retrying.");
  }
  return onSaved(null);
}
