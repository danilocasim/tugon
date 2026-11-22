import { IncidentDetail } from "@/features/barangay/incidents";

export const metadata = { title: "Incident" };

export default async function IncidentPage({ params }: PageProps<"/barangay/incidents/[id]">) {
  const { id } = await params;
  return <IncidentDetail id={id} />;
}
