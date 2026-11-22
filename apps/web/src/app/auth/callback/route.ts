import { NextResponse } from "next/server";
import { issuePasswordSetup } from "@/server/staff-password";
import { privateResponse, requestAuth } from "@/server/supabase";

function link(params: URLSearchParams | FormData) {
  const type = params.get("type");
  const token_hash = params.get("token_hash");
  if ((type === "invite" || type === "recovery") && typeof token_hash === "string" && /^[A-Za-z0-9_-]{20,256}$/u.test(token_hash)) {
    return { type, token_hash } as const;
  }
  return null;
}

function finish(origin: string, setup: "expired" | "password") {
  const response = NextResponse.redirect(new URL(`/barangay/signin?setup=${setup}`, origin), 303);
  response.headers.set("Cache-Control", privateResponse);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function GET(request: Request) {
  const origin = process.env.TUGON_ORIGIN;
  if (!origin) return new Response(null, { status: 503, headers: { "Cache-Control": privateResponse } });
  const emailLink = link(new URL(request.url).searchParams);
  if (!emailLink) return finish(origin, "expired");

  // Mail clients can prefetch links. Only an explicit form submission redeems the token.
  const heading = emailLink.type === "invite" ? "Accept your staff invitation" : "Reset your staff password";
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} · Munti Report</title>
<style>
body{min-height:100vh;margin:0;display:grid;place-items:center;background:#f3f1ed;color:#141a23;font:1rem/1.5 system-ui,sans-serif}
main{box-sizing:border-box;width:min(calc(100% - 2rem),28rem);padding:clamp(1.25rem,5vw,2rem);border:1px solid #dfdfdb;border-radius:1.5rem;background:#fff}
h1{font-size:1.5rem;line-height:1.2;margin:.5rem 0 0}
button{min-height:3rem;width:100%;border:0;border-radius:2rem;background:#0c5749;color:#fff;font:inherit;font-weight:650;cursor:pointer}
a{display:inline-block;margin-top:1rem;color:#0c5749}
</style></head><body><main>
<strong>Munti Report · Staff</strong><h1>${heading}</h1>
<p>Continue to set your password. <span lang="fil">Magpatuloy para itakda ang iyong password.</span></p>
<form method="post" action="/auth/callback">
<input type="hidden" name="type" value="${emailLink.type}">
<input type="hidden" name="token_hash" value="${emailLink.token_hash}">
<button type="submit">Continue / Magpatuloy</button>
</form><a href="/barangay/signin">Back to sign in</a></main></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": privateResponse,
      "Referrer-Policy": "origin",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}

export async function POST(request: Request) {
  const origin = process.env.TUGON_ORIGIN;
  if (!origin) return new Response(null, { status: 503, headers: { "Cache-Control": privateResponse } });
  if (request.headers.get("origin") !== origin) {
    return new Response(null, { status: 403, headers: { "Cache-Control": privateResponse } });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/x-www-form-urlencoded") return finish(origin, "expired");
  const emailLink = link(await request.formData());
  if (!emailLink) return finish(origin, "expired");

  const client = await requestAuth();
  const { data, error } = await client.auth.verifyOtp(emailLink);
  if (!error && data.session && await issuePasswordSetup()) return finish(origin, "password");
  if (data.session) await client.auth.signOut({ scope: "local" });
  return finish(origin, "expired");
}
