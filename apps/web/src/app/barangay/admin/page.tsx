import { Administration } from "@/features/barangay/admin";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin-tabs";
import { isUUID } from "@/lib/uuid";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { adminTab } from "@/server/admin-data";
import { requirePortal } from "@/server/identity";

export const metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: PageProps<"/barangay/admin">) {
  const { tab: key, person, invite } = await searchParams;
  const tab = typeof key === "string" && Object.hasOwn(ADMIN_TABS, key) ? key as AdminTab : "staff";
  const next = `/barangay/admin?tab=${tab}`;
  await requirePortal("staff", next);
  const data = await adminTab(tab);
  const selection = tab === "staff" && isUUID(person) ? person : null;
  return <DeskWorkspace area="admin" next={next}><Administration key={`${tab}/${selection}/${invite === "1"}`} tab={tab} data={data} selection={selection} openInvite={invite === "1"} /></DeskWorkspace>;
}
