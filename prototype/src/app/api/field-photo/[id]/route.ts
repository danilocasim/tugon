import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/policy";
import { readDb, readPhoto } from "@/server/db";
import { currentStaff, currentTanod } from "@/server/session";

export const dynamic = "force-dynamic";

/** Photo attached to a tanod's field report: the tanod who filed it, or staff allowed to view the case. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/field-photo/[id]">) {
  const { id } = await ctx.params;
  const db = readDb();
  const assignment = db.assignments.find((a) => a.id === id);
  const request = assignment && db.requests.find((r) => r.id === assignment.requestId);
  if (!assignment?.hasPhoto || !request) return NextResponse.json({ error: { code: "not_found", message: "No photo" } }, { status: 404 });

  const allowed =
    req.nextUrl.searchParams.get("portal") === "tanod" ? (await currentTanod(db))?.id === assignment.tanodId : can(await currentStaff(db), "view", request);
  if (!allowed) return NextResponse.json({ error: { code: "forbidden", message: "Not allowed" } }, { status: 403 });

  const bytes = readPhoto(assignment.id);
  if (!bytes) return NextResponse.json({ error: { code: "not_found", message: "No photo" } }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
