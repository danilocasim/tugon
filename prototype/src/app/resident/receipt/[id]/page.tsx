import { Receipt } from "@/features/resident/receipt";

export const metadata = { title: "Report received" };

export default async function ReceiptPage({ params, searchParams }: PageProps<"/resident/receipt/[id]">) {
  const { id } = await params;
  const { replayed } = await searchParams;
  return <Receipt id={id} replayed={replayed === "1"} />;
}
