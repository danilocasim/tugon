import { RequestDetail } from "@/features/resident/request-detail";

export const metadata = { title: "Request" };

export default async function RequestDetailPage({ params }: PageProps<"/resident/requests/[id]">) {
  const { id } = await params;
  return <RequestDetail id={id} />;
}
