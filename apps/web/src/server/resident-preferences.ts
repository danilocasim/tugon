"use server";

import { normalizeMobile } from "@/lib/duty";
import { failure, success } from "@/lib/result";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

export async function updateResidentPrefs(input: { phone?: string | null; smsUpdates?: boolean; emailUpdates?: boolean }) {
  if (!(await portalIdentity("resident"))) return failure("auth", "Sign in to change your preferences.");
  if (!input || typeof input !== "object") return failure("invalid", "Choose a preference.");
  const phoneChanged = Object.hasOwn(input, "phone");
  const local = typeof input.phone === "string" && input.phone.length <= 32 ? normalizeMobile(input.phone) : null;
  if (phoneChanged && input.phone !== null && !local) return failure("invalid", "Enter a valid Philippine mobile number.");
  if ((input.emailUpdates !== undefined && typeof input.emailUpdates !== "boolean") || (input.smsUpdates !== undefined && typeof input.smsUpdates !== "boolean")) return failure("invalid", "Choose a valid delivery preference.");
  const client = await requestAuth();
  const { error } = await client.rpc("update_resident_preferences", {
    p_phone_changed: phoneChanged, ...(local ? { p_phone: `+63${local.slice(1)}` } : {}), p_email: input.emailUpdates, p_sms: input.smsUpdates,
  });
  return error ? failure("invalid", "Couldn't update delivery preferences. Add a mobile number before enabling SMS.") : success(null);
}

export async function requestErasure(email: unknown) {
  if (typeof email !== "string" || email.length > 254) return failure("invalid", "Type the email used for this account.");
  if (!(await portalIdentity("resident"))) return failure("auth", "Sign in to request deletion.");
  const client = await requestAuth();
  const { error } = await client.rpc("request_account_erasure", { p_email: email });
  return error ? failure("invalid", "Check that the email matches your account.") : success(null);
}
