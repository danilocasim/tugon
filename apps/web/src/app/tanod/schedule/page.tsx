import { TanodSchedule } from "@/features/tanod/schedule";
import { TanodWorkspace } from "@/features/tanod/workspace";

export const metadata = { title: "Duty schedule" };

export default function SchedulePage() {
  return <TanodWorkspace next="/tanod/schedule"><TanodSchedule /></TanodWorkspace>;
}
