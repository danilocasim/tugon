import { notFound } from "next/navigation";
import { KpDocument } from "@/features/barangay/lupon-print";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { isUUID } from "@/lib/uuid";

export const metadata = { title: "Lupon document · Tugon Staff" };

export default async function ProceedingPrint({ params, searchParams }: PageProps<"/barangay/lupon/[id]/print">) {
  const { id } = await params;
  const { doc, hearing } = await searchParams;
  if (!isUUID(id) || (doc !== "summons" && doc !== "settlement" && doc !== "cfa")) notFound();
  return <DeskWorkspace area="lupon" next={`/barangay/lupon/${id}/print?doc=${doc}`}><KpDocument id={id} doc={doc} hearingId={typeof hearing === "string" && isUUID(hearing) ? hearing : null} /></DeskWorkspace>;
}
