import { NextResponse, type NextRequest } from "next/server";
import { FIELD_STATUS } from "@/lib/domain";
import { can } from "@/lib/policy";
import { readDb, readPhoto } from "@/server/db";
import { currentResident, currentStaff, currentTanod } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Private attachments: the resident's report photo, or (`kind=outcome`) the
 * proof-of-resolution photo. Served only to the reporting resident, staff
 * allowed to view the case, or a tanod while they hold an open assignment on it.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/photo/[id]">) {
  const { id } = await ctx.params;
  const db = readDb();
  const request = db.requests.find((r) => r.id === id);
  const outcome = req.nextUrl.searchParams.get("kind") === "outcome";
  if (!request || !(outcome ? request.outcomePhoto : request.hasPhoto)) return NextResponse.json({ error: { code: "not_found", message: "No photo" } }, { status: 404 });

  const portal = req.nextUrl.searchParams.get("portal");
  let allowed = false;
  if (portal === "resident") allowed = (await currentResident(db))?.id === request.residentId;
  else if (portal === "tanod") {
    const me = await currentTanod(db);
    allowed = !outcome && !!me && db.assignments.some((a) => a.requestId === id && a.tanodId === me.id && FIELD_STATUS[a.status].open);
  } else allowed = can(await currentStaff(db), "view", request);
  if (!allowed) return NextResponse.json({ error: { code: "forbidden", message: "Not allowed" } }, { status: 403 });

  const bytes = readPhoto(outcome ? `o_${id}` : id);
  if (!bytes) return NextResponse.json({ error: { code: "not_found", message: "No photo" } }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
