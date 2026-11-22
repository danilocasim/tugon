import { ReportFlow } from "@/features/resident/report";
import { CATEGORIES, type Category } from "@/lib/domain";

export const metadata = { title: "New report" };

export default async function ReportPage({ searchParams }: PageProps<"/resident/report">) {
  const { category } = await searchParams;
  const initial = CATEGORIES.includes(category as Category) ? (category as Category) : null;
  return <ReportFlow initialCategory={initial} />;
}
