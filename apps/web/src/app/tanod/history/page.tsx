import { TanodHistory } from "@/features/tanod/history";
import { TanodWorkspace } from "@/features/tanod/workspace";

export const metadata = { title: "History" };

export default function HistoryPage() {
  return <TanodWorkspace next="/tanod/history"><TanodHistory /></TanodWorkspace>;
}
