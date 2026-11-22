// Run manually in staging's private Storage container. This task never sends email.
const { ANON_KEY: anon, SERVICE_KEY: service, STORAGE_PUBLIC_URL: origin } = process.env;
const email = process.env.PULONG_RESEND_TEST_EMAIL?.trim().toLowerCase() ?? "";
const auth = "http://api-gw:8000/auth/v1";
let phase = "test configuration";

try {
  if (!anon || !service || !/^https:\/\/muntireport(?:\.\d{1,3}){4}\.sslip\.io$/u.test(origin ?? "")
      || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.endsWith(".test")) {
    throw new Error();
  }
  phase = "checking the private Auth service and closed signup";
  const settings = await fetch(`${auth}/settings`, {
    headers: { apikey: anon, authorization: `Bearer ${anon}` },
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!settings.ok) throw new Error();
  const result = await settings.json();
  if (result.disable_signup !== true || result.external?.email !== true || result.external?.phone !== false) throw new Error();

  phase = "creating the approved test login";
  // GoTrue treats unconfirmed accounts as signup requests. No password, membership,
  // or profile is created; the user must still redeem a code sent to their inbox.
  const created = await fetch(`${auth}/admin/users`, {
    method: "POST",
    headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!created.ok) {
    const { code, error_code: errorCode } = await created.json().catch(() => ({}));
    if ([code, errorCode].some((value) => value === "email_exists" || value === "user_already_exists")) {
      phase = "an account already exists; check its role before proceeding";
    }
    throw new Error();
  }
  const user = await created.json();
  if (user.email !== email || !user.id || !user.email_confirmed_at) throw new Error();
  console.log("Munti Report test login provisioned. No email sent; request a code from the resident sign-in page.");
} catch {
  console.error(`Munti Report test login was not provisioned: ${phase}. No credentials or recipient address were logged.`);
  process.exitCode = 1;
}
