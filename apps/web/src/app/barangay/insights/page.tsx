import { Insights } from "@/features/barangay/insights";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { readInsights } from "@/server/analytics-data";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: PageProps<"/barangay/insights">) {
  const report = await readInsights(await searchParams);
  return <DeskWorkspace area="insights" next="/barangay/insights"><Insights report={report} /></DeskWorkspace>;
}
