import { redirect } from "next/navigation";
import { requirePortal } from "@/server/identity";

export default async function StaffEntry() {
  const actor = await requirePortal("staff", "/barangay");
  redirect(actor.member.role === "admin" ? "/barangay/admin" : actor.member.role === "handler" ? "/barangay/queue" : "/barangay/inbox");
}
