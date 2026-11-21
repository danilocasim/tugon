import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions, CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export const privateResponse = "private, no-store, max-age=0";

export function authClient(cookieMethods: CookieMethodsServer) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured");
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  return createServerClient<Database>(url, key, { cookies: cookieMethods, cookieOptions });
}

export async function requestAuth() {
  const jar = await cookies();
  return authClient({
    getAll: () => jar.getAll(),
    setAll: (updates) => {
      // During render the Proxy has already refreshed the request cookie.
      for (const { name, value, options } of updates) {
        try { jar.set(name, value, options); }
        catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith("Cookies can only be modified")) throw error;
        }
      }
    },
  });
}
