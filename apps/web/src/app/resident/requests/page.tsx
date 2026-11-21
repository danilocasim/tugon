import { MyRequests } from "@/features/resident/requests";
import { requirePortal } from "@/server/identity";

export const metadata = { title: "My requests" };

export default async function RequestsPage() {
  await requirePortal("resident", "/resident/requests");
  return <MyRequests />;
}
