import { IncidentsPage } from "@/features/barangay/incidents";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Incidents" };

export default function IncidentIndex() {
  return <DeskWorkspace area="incidents" next="/barangay/incidents"><IncidentsPage /></DeskWorkspace>;
}
