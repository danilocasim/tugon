import { KpCaseDetail } from "@/features/barangay/lupon";

export const metadata = { title: "Lupon case" };

export default async function LuponCase({ params }: PageProps<"/barangay/lupon/[id]">) {
  const { id } = await params;
  return <KpCaseDetail id={id} />;
}
