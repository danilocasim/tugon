import { CaseWorkspace } from "@/features/barangay/case";

export const metadata = { title: "Case" };

export default async function CasePage({ params }: PageProps<"/barangay/cases/[id]">) {
  const { id } = await params;
  return <CaseWorkspace id={id} />;
}
