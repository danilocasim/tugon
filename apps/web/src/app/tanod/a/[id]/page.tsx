import { notFound } from "next/navigation";
import { AssignmentDetail } from "@/features/tanod/assignment";
import { TanodWorkspace } from "@/features/tanod/workspace";
import { isUUID } from "@/lib/uuid";

export const metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: PageProps<"/tanod/a/[id]">) {
  const { id } = await params;
  if (!isUUID(id)) notFound();
  return <TanodWorkspace next={`/tanod/a/${id}`} assignment={id}><AssignmentDetail id={id} /></TanodWorkspace>;
}
