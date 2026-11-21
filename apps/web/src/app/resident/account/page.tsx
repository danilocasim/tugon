import { Account } from "@/features/resident/account";
import { requirePortal } from "@/server/identity";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  await requirePortal("resident", "/resident/account");
  return <Account />;
}
