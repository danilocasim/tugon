"use server";

import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/database.types";
import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { portalIdentity } from "./identity";
import { serviceClient } from "./service-client";
import { requestAuth } from "./supabase";

const denied = () => failure("forbidden", "Only administrators can change these settings.");
async function admin() {
  const actor = await portalIdentity("staff");
  return actor?.member.role === "admin" ? actor : null;
}

export async function inviteStaff(form: FormData) {
  const actor = await admin();
  if (!actor) return denied();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "");
  const team = String(form.get("team") ?? "");
  const origin = process.env.TUGON_ORIGIN;
  if (!origin || name.length < 2 || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || !["intake", "handler", "supervisor", "admin"].includes(role)) {
    return failure("invalid", "Check the staff name, email, and role.");
  }
  if (role === "handler") {
    const client = await requestAuth();
    const { data } = await client.from("teams").select("id").eq("id", team).maybeSingle();
    if (!data) return failure("invalid", "Choose the handler's team.");
  }
  const service = serviceClient();
  const invite = await service.auth.admin.inviteUserByEmail(email, { redirectTo: new URL("/auth/callback", origin).href });
  if (invite.error || !invite.data.user) return failure("delivery", "Could not send the invitation. Check whether the email is already registered or SMTP is paused.");
  const { error } = await service.rpc("register_staff_invitation", { p_actor: actor.subject, p_user: invite.data.user.id, p_name: name, p_role: role, p_team: team });
  if (error) return failure("admin", "The invitation was accepted by Auth but membership could not be confirmed. Check the directory before attempting again.");
  revalidatePath("/barangay/admin");
  return success(null);
}

export async function updateStaffAccount(input: { id: string; active: boolean; role?: string; team?: string }) {
  if (!(await admin())) return denied();
  if (!isUUID(input?.id) || typeof input.active !== "boolean") return failure("invalid", "Choose a staff member.");
  const client = await requestAuth();
  const { error } = await client.rpc("staff_admin_change", { p_user: input.id, p_active: input.active, p_role: input.role, p_team: input.team });
  if (error) return failure("admin", "Could not change this staff membership.");
  revalidatePath("/barangay/admin");
  return success(null);
}

export async function changeAdminSetting(group: "targets" | "referral_add" | "referral_remove" | "privacy", value: Json) {
  if (!(await admin())) return denied();
  const client = await requestAuth();
  const { error } = await client.rpc("staff_admin_settings", { p_group: group, p_input: value });
  if (error) return failure("invalid", "Check the settings and try again.");
  revalidatePath("/barangay/admin");
  return success(null);
}
