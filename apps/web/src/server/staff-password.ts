import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { readIdentity } from "./identity";

const KEY = "tugon-staff-setup";
const validForSeconds = 600;

function signature(session: string, expires: string) {
  const secret = process.env.TUGON_SETUP_SECRET;
  if (!secret || secret.length < 32) throw new Error("Staff password setup is not configured");
  return createHmac("sha256", secret).update(`staff-password:${session}:${expires}`).digest();
}

export async function issuePasswordSetup() {
  const actor = await readIdentity();
  if (!actor?.session || !actor.member || actor.member.role === "resident" || actor.member.role === "tanod") return false;
  const expires = String(Math.floor(Date.now() / 1000) + validForSeconds);
  (await cookies()).set(KEY, `${expires}.${signature(actor.session, expires).toString("base64url")}`, {
    path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: validForSeconds,
  });
  return true;
}

export async function consumePasswordSetup() {
  const actor = await readIdentity();
  const cookie = (await cookies()).get(KEY)?.value ?? "";
  const [expires, token] = cookie.split(".");
  if (!actor?.session || !actor.member || actor.member.role === "resident" || actor.member.role === "tanod" || !/^\d{10}$/u.test(expires)
      || Number(expires) <= Date.now() / 1000 || !token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return false;
  return timingSafeEqual(signature(actor.session, expires), Buffer.from(token, "base64url"));
}
