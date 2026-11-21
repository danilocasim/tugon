import { WorkQueue } from "@/features/barangay/queue";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Work queue · Tugon Staff" };

export default function QueuePage() {
  return <DeskWorkspace next="/barangay/queue" area="queue"><WorkQueue /></DeskWorkspace>;
}
