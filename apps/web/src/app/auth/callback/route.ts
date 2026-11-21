import { NextResponse } from "next/server";
import { issuePasswordSetup } from "@/server/staff-password";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET(request: Request) {
  const origin = process.env.TUGON_ORIGIN;
  if (!origin) return new Response(null, { status: 503, headers: { "Cache-Control": privateResponse } });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const token_hash = params.get("token_hash");
  let location = "/barangay/signin?setup=expired";
  if ((type === "invite" || type === "recovery") && token_hash && /^[A-Za-z0-9_-]{20,256}$/u.test(token_hash)) {
    const client = await requestAuth();
    const { data, error } = await client.auth.verifyOtp({ token_hash, type });
    if (!error && data.session && await issuePasswordSetup()) location = "/barangay/signin?setup=password";
    else if (data.session) await client.auth.signOut({ scope: "local" });
  }
  const response = NextResponse.redirect(new URL(location, origin), 303);
  response.headers.set("Cache-Control", privateResponse);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
