"use server";

import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { readIdentity } from "./identity";
import { requestAuth } from "./supabase";
import { consumePasswordSetup } from "./staff-password";

const unavailable = () => failure("auth", "We couldn't sign you in with those details.");

export async function startStaffSession(input: { email: string; password: string }) {
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email.includes("@") || email.length > 254 || typeof input.password !== "string" || !input.password || input.password.length > 256) return unavailable();
  const client = await requestAuth();
  const { data, error } = await client.auth.signInWithPassword({ email, password: input.password });
  if (error || !data.user?.email_confirmed_at) return unavailable();
  const { data: member } = await client.from("memberships").select("name,role").eq("user_id", data.user.id).maybeSingle();
  if (!member || member.role === "resident" || member.role === "tanod") {
    await client.auth.signOut({ scope: "local" });
    return unavailable();
  }
  return success({ name: member.name });
}

async function staffFactorClient() {
  const identity = await readIdentity();
  if (!identity?.member || identity.member.role === "resident" || identity.member.role === "tanod" || !identity.password) return null;
  return requestAuth();
}

export async function prepareStaffFactor() {
  const client = await staffFactorClient();
  if (!client) return unavailable();
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) return unavailable();
  const verified = data.totp[0];
  if (verified) return success({ id: verified.id, qr: null, secret: null });
  for (const factor of data.all) {
    if (factor.status === "unverified" && factor.factor_type === "totp") {
      const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) return unavailable();
    }
  }
  const res = await client.auth.mfa.enroll({ factorType: "totp", issuer: "Munti Report", friendlyName: "Munti Report Staff" });
  if (res.error || !res.data) return failure("mfa", "We couldn't prepare your authenticator. Try again.");
  return success({ id: res.data.id, qr: res.data.totp.qr_code, secret: res.data.totp.secret });
}

export async function verifyStaffFactor(input: { id: string; code: string }) {
  if (!isUUID(input?.id) || typeof input.code !== "string" || !/^\d{6}$/u.test(input.code)) return failure("mfa", "Enter the six-digit authenticator code.");
  const client = await staffFactorClient();
  if (!client) return unavailable();
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: input.id, code: input.code });
  return error ? failure("mfa", "The authenticator code was not accepted.") : success(null);
}

export async function requestStaffReset(value: unknown) {
  if (typeof value !== "string" || !value.includes("@") || value.length > 254) return failure("invalid", "Enter your work email.");
  const origin = process.env.TUGON_ORIGIN;
  if (!origin) return failure("auth", "Password reset is not configured.");
  const client = await requestAuth();
  await client.auth.resetPasswordForEmail(value.trim().toLowerCase(), { redirectTo: new URL("/auth/callback", origin).href });
  return success(null);
}

export async function setStaffPassword(password: unknown, code: unknown) {
  if (typeof password !== "string" || password.length < 14 || password.length > 256) return failure("invalid", "Use a password of 14 to 256 characters.");
  if (!(await consumePasswordSetup())) return failure("auth", "Open a new invitation or password reset email.");
  const client = await requestAuth();
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return unavailable();
  const verified = factors.data.totp[0];
  if (verified) {
    if (typeof code !== "string" || !/^\d{6}$/u.test(code)) return failure("mfa", "Enter the six-digit authenticator code.");
    const challenge = await client.auth.mfa.challengeAndVerify({ factorId: verified.id, code });
    if (challenge.error) return failure("mfa", "The authenticator code was not accepted.");
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) return failure("auth", "We couldn't set your password. Check the password rules and try again.");
  await client.auth.signOut({ scope: "global" });
  return success(null);
}
