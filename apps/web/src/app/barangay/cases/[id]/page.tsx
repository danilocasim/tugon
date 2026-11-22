import { notFound } from "next/navigation";
import { CaseWorkspace } from "@/features/barangay/case";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { isUUID } from "@/lib/uuid";
import { requirePortal } from "@/server/identity";
import { readStaffCase } from "@/server/staff-data";

export const metadata = { title: "Case" };

export default async function CasePage({ params }: PageProps<"/barangay/cases/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  await requirePortal("staff", `/barangay/cases/${id}`);
  const record = await readStaffCase(id);
  if (!record) notFound();
  return <DeskWorkspace next={`/barangay/cases/${id}`} area="case" record={record}><CaseWorkspace id={id} /></DeskWorkspace>;
}
