import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  let ready = false;
  if (url && key) {
    try {
      const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error, data } = await client.from("civic_settings").select("singleton").abortSignal(AbortSignal.timeout(2000)).single();
      ready = !error && data?.singleton === true;
    } catch { /* A disconnected database is not ready. */ }
  }
  return Response.json({ status: ready ? "ready" : "unavailable" }, { headers, status: ready ? 200 : 503 });
}
