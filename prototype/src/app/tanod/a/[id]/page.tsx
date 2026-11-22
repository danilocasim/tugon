import { AssignmentDetail } from "@/features/tanod/assignment";

export const metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: PageProps<"/tanod/a/[id]">) {
  const { id } = await params;
  return <AssignmentDetail id={id} />;
}
