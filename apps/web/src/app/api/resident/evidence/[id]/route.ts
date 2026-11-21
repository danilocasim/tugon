import { isUUID } from "@/lib/uuid";
import { evidenceBucket, reportEvidenceKey } from "@/server/evidence";
import { portalIdentity } from "@/server/identity";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET(_: Request, { params }: RouteContext<"/api/resident/evidence/[id]">) {
  const { id } = await params;
  const headers = { "Cache-Control": privateResponse, "X-Content-Type-Options": "nosniff" };
  const actor = isUUID(id) ? await portalIdentity("resident") : null;
  if (!actor) return new Response(null, { status: 404, headers });
  const client = await requestAuth();
  const { data: row, error } = await client.from("service_requests").select("submission_key")
    .eq("id", id).eq("resident_id", actor.subject).eq("has_photo", true).maybeSingle();
  if (error) return new Response(null, { status: 503, headers });
  if (!row?.submission_key) return new Response(null, { status: 404, headers });
  const photo = await evidenceBucket().download(reportEvidenceKey(actor.subject, row.submission_key));
  if (photo.error || !photo.data) return new Response(null, { status: 503, headers });
  return new Response(photo.data.stream(), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Security-Policy": "default-src 'none'" } });
}
