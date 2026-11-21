import { Updates } from "@/features/resident/updates";
import { requirePortal } from "@/server/identity";

export const metadata = { title: "Updates" };

export default async function UpdatesPage() {
  await requirePortal("resident", "/resident/updates");
  return <Updates />;
}
