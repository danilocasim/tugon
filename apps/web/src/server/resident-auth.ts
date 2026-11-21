"use server";

import type { Lang } from "@/lib/domain";
import { failure, success, type Result } from "@/lib/result";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const emailError = () => failure("invalid", "Enter a valid email address.", "email");

export async function sendResidentCode(value: unknown): Promise<Result> {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return emailError();
  const client = await requestAuth();
  const { error } = await client.auth.signInWithOtp({ email });
  if (error?.status === 429) return failure("rate_limit", "Wait a minute before requesting another code.", "email");
  if (error) return failure("delivery", "We couldn't request a code right now. Try again shortly.", "email");
  return success(null);
}

export async function signInResident(input: { email: string; code: string }): Promise<Result<{ known: boolean }>> {
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return emailError();
  if (typeof input?.code !== "string" || !/^\d{6}$/u.test(input.code)) return failure("invalid", "Enter the six-digit code from your email.", "code");
  const client = await requestAuth();
  const { data, error } = await client.auth.verifyOtp({ email, token: input.code, type: "email" });
  if (error || !data.session || !data.user?.email_confirmed_at) return failure("invalid", "That code is invalid or has expired. Request a new code and try again.", "code");
  const { data: membership, error: readError } = await client.from("memberships").select("role").eq("user_id", data.user.id).maybeSingle();
  if (readError) return failure("server_error", "We couldn't read your account right now.");
  if (membership && membership.role !== "resident") {
    await client.auth.signOut({ scope: "local" });
    return failure("forbidden", "Use the portal for your account.", "code");
  }
  return success({ known: membership?.role === "resident" });
}

export async function createResidentAccount(input: { name: string; purok: string; lang: Lang; consent: boolean }): Promise<Result> {
  if (!input || typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 100) return failure("invalid", "Enter your name.", "name");
  if (typeof input.purok !== "string" || !/^P[1-5]$/u.test(input.purok)) return failure("invalid", "Select your purok.", "purok");
  if (input.lang !== "en" && input.lang !== "fil") return failure("invalid", "Choose English or Filipino.");
  if (input.consent !== true) return failure("invalid", "Acknowledge the privacy notice to continue.", "consent");
  const client = await requestAuth();
  const { error } = await client.rpc("complete_resident_profile", {
    p_name: input.name.trim(), p_purok: input.purok, p_lang: input.lang, p_consented: input.consent,
  });
  if (error) return failure("forbidden", "We couldn't create your resident profile. Verify your email or contact the barangay.");
  return success(null);
}

export async function updateResidentLanguage(lang: Lang): Promise<Result> {
  if (lang !== "fil" && lang !== "en") return failure("invalid", "Choose English or Filipino.");
  const identity = await portalIdentity("resident");
  if (!identity) return failure("unauthorized", "Sign in to update your language.");
  const client = await requestAuth();
  const { error } = await client.from("resident_profiles").update({ lang }).eq("user_id", identity.subject);
  return error ? failure("server_error", "We couldn't save your language.") : success(null);
}

export async function signOutResident(): Promise<Result> {
  const client = await requestAuth();
  const { error } = await client.auth.signOut({ scope: "local" });
  return error ? failure("server_error", "We couldn't sign you out. Try again.") : success(null);
}
