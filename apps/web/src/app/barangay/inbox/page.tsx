import { IntakeInbox } from "@/features/barangay/inbox";
import { DeskWorkspace } from "@/features/barangay/workspace";

export const metadata = { title: "Intake inbox · Tugon Staff" };

export default function InboxPage() {
  return <DeskWorkspace next="/barangay/inbox" area="inbox"><IntakeInbox /></DeskWorkspace>;
}
