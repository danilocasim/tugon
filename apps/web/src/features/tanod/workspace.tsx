import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LiveProvider } from "@/hooks/use-live";
import { tanodSnapshot } from "@/server/field-data";
import { requirePortal } from "@/server/identity";
import { TanodShell } from "./shell";

export async function TanodWorkspace({ next, assignment, children }: { next: string; assignment?: string; children: ReactNode }) {
  await requirePortal("tanod", next);
  const data = await tanodSnapshot();
  if (!data?.me || (assignment && !data.assignments.some((row) => row.id === assignment))) notFound();
  return <LiveProvider portal="tanod" initial={data}><TanodShell>{children}</TanodShell></LiveProvider>;
}
