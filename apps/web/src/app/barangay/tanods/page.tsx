import { TanodsPage } from "@/features/barangay/tanods";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Tanods · Tugon Staff" };

export default function StaffTanodsPage() {
  return <DeskWorkspace next="/barangay/tanods" area="tanods"><TanodsPage /></DeskWorkspace>;
}
