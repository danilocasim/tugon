import { isUUID } from "@/lib/uuid";
import { evidenceBucket, reportEvidenceKey } from "@/server/evidence";
import { portalIdentity } from "@/server/identity";
import { serviceClient } from "@/server/service-client";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET(request: Request, { params }: RouteContext<"/api/field-photo/[id]">) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const portal = searchParams.get("portal") === "tanod" ? "tanod" : "staff";
  const original = searchParams.get("kind") === "original";
  const headers = { "Cache-Control": privateResponse, "X-Content-Type-Options": "nosniff" };
  const actor = isUUID(id) ? await portalIdentity(portal) : null;
  if (!actor || (original && portal !== "tanod")) return new Response(null, { status: 404, headers });
  const db = await requestAuth();
  const query = db.from("field_assignments").select("id,request_id,status,has_photo").eq("id", id);
  if (portal === "tanod") query.eq("tanod_id", actor.subject);
  const { data: assignment, error } = await query.maybeSingle();
  if (error) return new Response(null, { status: 503, headers });
  if (!assignment) return new Response(null, { status: 404, headers });
  let path = `field/${id}.jpg`;
  if (original) {
    if (!["assigned", "accepted", "on_scene"].includes(assignment.status)) return new Response(null, { status: 404, headers });
    const { data } = await serviceClient().from("service_requests").select("status,has_photo,submission_key,resident_id").eq("id", assignment.request_id).maybeSingle();
    if (!data?.has_photo || !data.resident_id || !data.submission_key || !["received", "review", "needs_info", "queued", "in_progress"].includes(data.status)) return new Response(null, { status: 404, headers });
    path = reportEvidenceKey(data.resident_id, data.submission_key);
  } else if (!assignment.has_photo || assignment.status !== "done") return new Response(null, { status: 404, headers });
  const photo = await evidenceBucket().download(path);
  if (!photo.data || photo.error) return new Response(null, { status: 503, headers });
  return new Response(photo.data.stream(), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Security-Policy": "default-src 'none'" } });
}
