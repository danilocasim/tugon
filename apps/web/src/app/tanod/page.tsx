import { TanodHome } from "@/features/tanod/home";
import { TanodWorkspace } from "@/features/tanod/workspace";

export default function TanodEntry() {
  return <TanodWorkspace next="/tanod"><TanodHome /></TanodWorkspace>;
}
