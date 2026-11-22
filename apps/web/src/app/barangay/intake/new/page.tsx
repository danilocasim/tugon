import { AssistedIntake } from "@/features/barangay/intake-new";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Record a request" };

export default function IntakePage() {
  return <DeskWorkspace next="/barangay/intake/new" area="intake"><AssistedIntake /></DeskWorkspace>;
}
