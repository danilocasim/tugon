import { notFound } from "next/navigation";
import { IncidentDetail } from "@/features/barangay/incidents";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { isUUID } from "@/lib/uuid";

export const metadata = { title: "Incident" };

export default async function IncidentPage({ params }: PageProps<"/barangay/incidents/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  return <DeskWorkspace area="incidents" next={`/barangay/incidents/${id}`} incidentId={id}><IncidentDetail id={id} /></DeskWorkspace>;
}
