import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LiveProvider } from "@/hooks/use-live";
import { canAccess, type Area } from "@/lib/policy";
import { requirePortal } from "@/server/identity";
import { staffSnapshot } from "@/server/staff-data";
import type { readStaffCase } from "@/server/staff-data";
import { StaffShell } from "./shell";

export async function DeskWorkspace({ next, area, children, record, incidentId }: {
  next: string; area: Area; children: ReactNode; record?: NonNullable<Awaited<ReturnType<typeof readStaffCase>>>; incidentId?: string;
}) {
  await requirePortal("staff", next);
  const state = await staffSnapshot(incidentId);
  if (!state?.me || !canAccess(state.me, area)) redirect("/barangay/tanods");
  if (record) {
    if (!state.requests.some((row) => row.id === record.report.id)) state.requests.push(record.report);
    if (record.reporter) state.residents[record.reporter.id] = record.reporter;
  }
  return <LiveProvider key={incidentId} portal="staff" initial={state} incidentId={incidentId}><StaffShell>{children}</StaffShell></LiveProvider>;
}
