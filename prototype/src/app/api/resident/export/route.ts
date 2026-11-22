import { NextResponse } from "next/server";
import { readDb } from "@/server/db";
import { currentResident } from "@/server/session";
import { residentSnapshot } from "@/server/views";

export const dynamic = "force-dynamic";

/** Right of access (RA 10173): everything the barangay holds that is linked to this account, as one JSON file. */
export async function GET() {
  const db = readDb();
  const me = await currentResident(db);
  if (!me) return NextResponse.json({ error: { code: "unauthenticated", message: "Please sign in." } }, { status: 401 });
  const snap = await residentSnapshot(db);
  const body = {
    exportedAt: new Date().toISOString(),
    controller: `${db.settings.barangay}, ${db.settings.city}`,
    dataProtectionOfficer: db.settings.privacy.dpo,
    account: me,
    requests: snap.requests,
    notifications: snap.notifications,
    textMessages: me.phone ? db.sms.filter((m) => m.to === me.phone).map(({ to: _to, ...m }) => m) : [],
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tugon-my-data-${me.id}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
