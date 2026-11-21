import { LuponDocket } from "@/features/barangay/lupon";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Lupon docket · Tugon Staff" };

export default function LuponPage() {
  return <DeskWorkspace area="lupon" next="/barangay/lupon"><LuponDocket /></DeskWorkspace>;
}
