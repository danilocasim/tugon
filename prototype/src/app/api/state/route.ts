import { NextResponse, type NextRequest } from "next/server";
import { readDb } from "@/server/db";
import { residentSnapshot, staffSnapshot, tanodSnapshot } from "@/server/views";

export const dynamic = "force-dynamic";

const SNAPSHOT = { resident: residentSnapshot, staff: staffSnapshot, tanod: tanodSnapshot } as const;

export async function GET(req: NextRequest) {
  const portal = req.nextUrl.searchParams.get("portal");
  if (portal !== "resident" && portal !== "staff" && portal !== "tanod") {
    return NextResponse.json({ error: { code: "invalid_portal", message: "portal must be resident, staff or tanod" } }, { status: 400 });
  }
  return NextResponse.json(await SNAPSHOT[portal](readDb()), { headers: { "Cache-Control": "no-store" } });
}
