import { LuponDocket } from "@/features/barangay/lupon";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Lupon docket" };

export default function LuponPage() {
  return <DeskWorkspace area="lupon" next="/barangay/lupon"><LuponDocket /></DeskWorkspace>;
}
