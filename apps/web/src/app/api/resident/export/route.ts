import { portalIdentity } from "@/server/identity";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET() {
  const headers = { "Cache-Control": privateResponse, "X-Content-Type-Options": "nosniff" };
  const actor = await portalIdentity("resident");
  if (!actor) return Response.json({ error: "Sign in to download your data." }, { status: 401, headers });
  const client = await requestAuth();
  const profile = await client.from("resident_profiles").select("purok,lang,notice_version,agreed_at,email_updates,sms_updates,sms_opted_in_at").eq("user_id", actor.subject).single();
  if (profile.error) return Response.json({ error: "Unable to read account." }, { status: 503, headers });
  const requests = [];
  const updates = [];
  for (let offset = 0;; offset += 100) {
    const res = await client.from("service_requests").select("id,ref,channel,description,resident_category,category,danger_now,location,status,created_at,updated_at,closed_at,outcome,referral_office,has_photo,outcome_photo,resident_request_events(id,created_at,event_type,author,message)")
      .eq("resident_id", actor.subject).order("id").range(offset, offset + 99);
    if (res.error) return Response.json({ error: "Unable to read report history." }, { status: 503, headers });
    requests.push(...res.data);
    if (res.data.length < 100) break;
  }
  for (let offset = 0;; offset += 100) {
    const res = await client.from("resident_notifications").select("request_id,kind,created_at,read_at").eq("resident_id", actor.subject).order("id").range(offset, offset + 99);
    if (res.error) return Response.json({ error: "Unable to read update history." }, { status: 503, headers });
    updates.push(...res.data);
    if (res.data.length < 100) break;
  }
  const audit = await client.rpc("record_my_access_export");
  if (audit.error) return Response.json({ error: "Unable to authorize the export." }, { status: 503, headers });
  const account = { email: actor.email, name: actor.member.name, mobile: actor.member.phone, ...profile.data };
  return Response.json({ account, requests, updates }, { headers: { ...headers, "Content-Disposition": 'attachment; filename="tugon-my-data.json"' } });
}
