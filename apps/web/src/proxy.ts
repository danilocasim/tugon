import { NextResponse, type NextRequest } from "next/server";
import { authClient, privateResponse } from "@/server/supabase";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const client = authClient({
      getAll: () => request.cookies.getAll(),
      setAll(updates, headers) {
        for (const { name, value } of updates) request.cookies.set(name, value);
        const next = NextResponse.next({ request });
        for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
        for (const { name, value, options } of updates) next.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
        response = next;
      },
    });
    await client.auth.getClaims();
  }
  response.headers.set("Cache-Control", privateResponse);
  return response;
}

export const config = { matcher: ["/resident/:path*", "/barangay/:path*", "/tanod/:path*", "/api/state/:path*", "/auth/:path*"] };
