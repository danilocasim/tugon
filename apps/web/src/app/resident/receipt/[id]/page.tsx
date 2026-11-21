import { notFound } from "next/navigation";
import { Receipt } from "@/features/resident/receipt";
import type { Category, LocationInfo } from "@/lib/domain";
import { isUUID } from "@/lib/uuid";
import { requirePortal } from "@/server/identity";
import { publicSettings } from "@/server/resident-data";
import { requestAuth } from "@/server/supabase";

export const metadata = { title: "Report received" };

export default async function ReceiptPage({ params, searchParams }: PageProps<"/resident/receipt/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  const { replayed } = await searchParams;
  const actor = await requirePortal("resident", `/resident/receipt/${id}`);
  const client = await requestAuth();
  const [{ data, error }, settings] = await Promise.all([
    client.from("service_requests").select("id,ref,created_at,resident_category,location").eq("id", id).eq("resident_id", actor.subject).maybeSingle(),
    publicSettings(),
  ]);
  if (error) throw new Error("Unable to read receipt", { cause: error.code });
  if (!data) notFound();
  return <Receipt settings={{ barangay: settings.barangay, intakeHours: settings.intakeHours }} replayed={replayed === "1"}
    report={{ id: data.id, ref: data.ref, createdAt: Date.parse(data.created_at), residentCategory: data.resident_category as Category | null, location: data.location as LocationInfo | null }} />;
}
