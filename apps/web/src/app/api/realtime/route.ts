import type { Portal } from "@/lib/auth-path";
import { portalIdentity } from "@/server/identity";
import { privateResponse, requestAuth } from "@/server/supabase";

export async function GET(request: Request) {
  const headers = { "Cache-Control": privateResponse };
  const portal = new URL(request.url).searchParams.get("portal");
  if (portal !== "resident" && portal !== "staff" && portal !== "tanod") return Response.json(null, { status: 400, headers });
  const actor = await portalIdentity(portal);
  if (!actor) return Response.json(null, { status: 401, headers });
  const url = process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json(null, { status: 503, headers });
  const auth = await requestAuth();
  const { data } = await auth.auth.getSession();
  if (!data.session?.access_token || !data.session.expires_at) return Response.json(null, { status: 401, headers });
  return Response.json({ url, key, accessToken: data.session.access_token, expiresAt: data.session.expires_at, topics: topicsFor(portal, actor) }, { headers });
}

type Actor = NonNullable<Awaited<ReturnType<typeof portalIdentity>>>;
function topicsFor(portal: Portal, actor: Actor) {
  const { subject, member } = actor;
  if (portal !== "staff") return [`tugon:${portal}:${subject}`];
  if (member.role === "admin") return [];
  const topics = [`tugon:staff:${subject}`];
  if (member.role === "supervisor") topics.push("tugon:supervisors");
  if (member.role === "intake") topics.push("tugon:intake");
  if (member.role === "handler" && member.team_id) topics.push(`tugon:team:${member.team_id}`);
  return topics;
}
