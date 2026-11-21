import { ReportFlow } from "@/features/resident/report";
import { CATEGORIES, type Category } from "@/lib/domain";
import { requirePortal } from "@/server/identity";

export const metadata = { title: "New report" };

export default async function ReportPage({ searchParams }: PageProps<"/resident/report">) {
  const { category } = await searchParams;
  const initial = CATEGORIES.find((item: Category) => item === category) ?? null;
  const actor = await requirePortal("resident", initial ? `/resident/report?category=${initial}` : "/resident/report");
  return <ReportFlow key={`${actor.subject}:${initial ?? "unsure"}`} initialCategory={initial} />;
}
