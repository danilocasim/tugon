import { KpDocument, type KpDoc } from "@/features/barangay/lupon-print";

export const metadata = { title: "Lupon document" };

const DOCS: KpDoc[] = ["summons", "settlement", "cfa"];

export default async function LuponPrint({ params, searchParams }: PageProps<"/barangay/lupon/[id]/print">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const doc = DOCS.find((d) => d === query.doc) ?? "summons";
  const hearing = typeof query.hearing === "string" ? query.hearing : null;
  return <KpDocument id={id} doc={doc} hearingId={hearing} />;
}
