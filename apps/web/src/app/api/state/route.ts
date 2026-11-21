import { isUUID } from "@/lib/uuid";
import { residentSnapshot } from "@/server/resident-data";
import { staffSnapshot } from "@/server/staff-data";
import { tanodSnapshot } from "@/server/field-data";
import { privateResponse } from "@/server/supabase";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const headers = { "Cache-Control": privateResponse };
  if (searchParams.get("portal") === "resident") {
    return Response.json(await residentSnapshot(), { headers });
  }
  if (searchParams.get("portal") === "staff") {
    const incident = searchParams.get("incident");
    if (incident !== null && !isUUID(incident)) return Response.json(null, { status: 400, headers });
    const snapshot = await staffSnapshot(incident ?? undefined);
    return snapshot ? Response.json(snapshot, { headers }) : Response.json(null, { status: 401, headers });
  }
  if (searchParams.get("portal") === "tanod") {
    const snapshot = await tanodSnapshot();
    return snapshot ? Response.json(snapshot, { headers }) : Response.json(null, { status: 401, headers });
  }
  return Response.json({ error: "Unknown portal" }, { status: 400, headers });
}
