import { notFound } from "next/navigation";
import { KpCaseDetail } from "@/features/barangay/lupon";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { isUUID } from "@/lib/uuid";

export const metadata = { title: "Lupon case · Tugon Staff" };

export default async function ProceedingPage({ params }: PageProps<"/barangay/lupon/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  return <DeskWorkspace area="lupon" next={`/barangay/lupon/${id}`}><KpCaseDetail id={id} /></DeskWorkspace>;
}
