/**
 * Prototype sessions: an httpOnly cookie per portal so a resident, a desk staff
 * member and a tanod can be signed in side by side in one browser. The cookie
 * holds only a demo account id; production uses server-side sessions with
 * rotation and MFA.
 */
import { cookies } from "next/headers";
import type { DB, Resident, Staff } from "@/lib/domain";

export type Portal = "resident" | "staff" | "tanod";
const COOKIE: Record<Portal, string> = { resident: "tugon_resident", staff: "tugon_staff", tanod: "tugon_tanod" };

export async function sessionId(portal: Portal) {
  return (await cookies()).get(COOKIE[portal])?.value ?? null;
}

export async function setSession(portal: Portal, id: string) {
  (await cookies()).set(COOKIE[portal], id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession(portal: Portal) {
  (await cookies()).delete(COOKIE[portal]);
}

export async function currentResident(db: DB): Promise<Resident | null> {
  const id = await sessionId("resident");
  return db.residents.find((r) => r.id === id) ?? null;
}

/** Desk staff only: tanod accounts never get a desk session. */
export async function currentStaff(db: DB): Promise<Staff | null> {
  const id = await sessionId("staff");
  return db.staff.find((s) => s.id === id && s.active && s.role !== "tanod") ?? null;
}

export async function currentTanod(db: DB): Promise<Staff | null> {
  const id = await sessionId("tanod");
  return db.staff.find((s) => s.id === id && s.active && s.role === "tanod") ?? null;
}
