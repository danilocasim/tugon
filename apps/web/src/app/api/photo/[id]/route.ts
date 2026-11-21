import { isUUID } from "@/lib/uuid";
import { evidenceBucket, reportEvidenceKey } from "@/server/evidence";
import { portalIdentity } from "@/server/identity";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET(request: Request, { params }: RouteContext<"/api/photo/[id]">) {
  const { id } = await params;
  const url = new URL(request.url);
  const portal = url.searchParams.get("portal");
  const proof = url.searchParams.get("kind") === "outcome";
  const headers = { "Cache-Control": privateResponse, "X-Content-Type-Options": "nosniff" };
  const actor = isUUID(id) && (portal === "staff" || portal === "resident") ? await portalIdentity(portal) : null;
  if (!actor) return new Response(null, { status: 404, headers });
  const client = await requestAuth();
  const query = client.from("service_requests").select("id,resident_id,submission_key,has_photo,outcome_object,status").eq("id", id);
  if (portal === "resident") query.eq("resident_id", actor.subject);
  const { data: row, error } = await query.maybeSingle();
  if (error) return new Response(null, { status: 503, headers });
  const key = !row ? null : proof ? row.status === "resolved" ? row.outcome_object : null
    : row.has_photo && row.resident_id && row.submission_key ? reportEvidenceKey(row.resident_id, row.submission_key) : null;
  if (!key) return new Response(null, { status: 404, headers });
  const photo = await evidenceBucket().download(key);
  if (photo.error || !photo.data) return new Response(null, { status: 503, headers });
  return new Response(photo.data.stream(), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Security-Policy": "default-src 'none'" } });
}
