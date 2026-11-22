import { Suspense } from "react";
import { IntakeInbox } from "@/features/barangay/inbox";

export const metadata = { title: "Intake inbox" };

export default function InboxPage() {
  return (
    <Suspense>
      <IntakeInbox />
    </Suspense>
  );
}
