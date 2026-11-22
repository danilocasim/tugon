import { MyCases } from "@/features/barangay/mine";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "My cases" };

export default function MinePage() {
  return <DeskWorkspace next="/barangay/mine" area="mine"><MyCases /></DeskWorkspace>;
}
