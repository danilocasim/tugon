import { IntakeInbox } from "@/features/barangay/inbox";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Intake inbox" };

export default function InboxPage() {
  return <DeskWorkspace next="/barangay/inbox" area="inbox"><IntakeInbox /></DeskWorkspace>;
}
