import { notFound } from "next/navigation";
import { RequestDetail } from "@/features/resident/request-detail";
import { isUUID } from "@/lib/uuid";
import { requirePortal } from "@/server/identity";
import { readResidentRequest } from "@/server/resident-data";

export const metadata = { title: "Request details" };

export default async function RequestPage({ params }: PageProps<"/resident/requests/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  const actor = await requirePortal("resident", `/resident/requests/${id}`);
  const report = await readResidentRequest(id, actor);
  if (!report) notFound();
  return <RequestDetail initial={report} />;
}
