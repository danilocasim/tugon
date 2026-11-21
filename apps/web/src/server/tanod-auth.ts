"use server";

import { normalizeMobile } from "@/lib/duty";
import { failure, success } from "@/lib/result";
import { requestAuth } from "./supabase";

function e164(value: unknown) {
  const normalized = typeof value === "string" && value.length <= 32 ? normalizeMobile(value) : null;
  return normalized ? `+63${normalized.slice(1)}` : null;
}

export async function sendTanodCode(value: unknown) {
  const phone = e164(value);
  if (!phone) return failure("invalid", "Enter your registered Philippine mobile number.");
  const client = await requestAuth();
  const { error } = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false, channel: "sms" } });
  if (error?.status === 429) return failure("rate_limit", "Wait a minute before requesting a code again.");
  return success({ suffix: phone.slice(-4) });
}

export async function verifyTanodCode(input: { phone: string; code: string }) {
  const phone = e164(input?.phone);
  if (!phone || typeof input.code !== "string" || !/^\d{6}$/u.test(input.code)) return failure("invalid", "Enter the six-digit code from your message.");
  const client = await requestAuth();
  const { data, error } = await client.auth.verifyOtp({ phone, token: input.code, type: "sms" });
  const denied = () => failure("auth", "The code wasn't accepted or the officer account is inactive.");
  if (error || !data.session || !data.user?.phone_confirmed_at) return denied();
  const { data: member } = await client.from("memberships").select("role,phone").eq("user_id", data.user.id).maybeSingle();
  if (member?.role !== "tanod" || member.phone !== phone) {
    await client.auth.signOut({ scope: "local" });
    return denied();
  }
  return success(null);
}
