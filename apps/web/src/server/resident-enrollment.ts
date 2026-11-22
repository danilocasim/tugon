import "server-only";

const action = "resident_email_otp";
const siteVerify = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Enrollment =
  | { mode: "invite" | "unavailable" }
  | { mode: "public"; siteKey: string; secret: string; hostname: string; action: string };

export function residentEnrollment(): Enrollment {
  const mode = process.env.TUGON_RESIDENT_PUBLIC_SIGNUP;
  if (!mode || mode === "off") return { mode: "invite" };
  const siteKey = process.env.TUGON_TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TUGON_TURNSTILE_SECRET_KEY?.trim();
  const origin = URL.parse(process.env.TUGON_ORIGIN ?? "");
  if (mode !== "on" || !siteKey || !secret || !origin || origin.protocol !== "https:" || origin.origin !== process.env.TUGON_ORIGIN) {
    return { mode: "unavailable" };
  }
  return { mode: "public", siteKey, secret, hostname: origin.hostname, action };
}

export async function verifyResidentChallenge(config: Extract<Enrollment, { mode: "public" }>, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const response = await fetch(siteVerify, {
      method: "POST",
      body: new URLSearchParams({ secret: config.secret, response: token }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return !!value && typeof value === "object"
      && "success" in value && value.success === true
      && "hostname" in value && value.hostname === config.hostname
      && "action" in value && value.action === config.action;
  } catch {
    // Never start an email send if verification is unreachable or malformed.
    return false;
  }
}
