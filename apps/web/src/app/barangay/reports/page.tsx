import { MonthlyReport } from "@/features/barangay/monthly-report";
import { DeskWorkspace } from "@/features/barangay/workspace";
import { readMonthlyReport } from "@/server/analytics-data";

export const metadata = { title: "Monthly report · Tugon Staff" };

export default async function ReportsPage({ searchParams }: PageProps<"/barangay/reports">) {
  const report = await readMonthlyReport(await searchParams);
  return <DeskWorkspace area="reports" next="/barangay/reports"><MonthlyReport report={report} /></DeskWorkspace>;
}
