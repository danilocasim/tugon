import type { Metadata, Viewport } from "next";
import { LiveProvider } from "@/hooks/use-live";
import { LangProvider } from "@/features/resident/lang";
import { ResidentShell } from "@/features/resident/shell";
import { residentSnapshot } from "@/server/resident-data";

export const metadata: Metadata = {
  title: { default: "Resident portal", template: "%s · Tugon" },
  manifest: "/resident.webmanifest",
  appleWebApp: { capable: true, title: "Tugon", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f2f1ed" };

export default async function ResidentLayout({ children }: LayoutProps<"/resident">) {
  const initial = await residentSnapshot();
  return (
    <LiveProvider portal="resident" initial={initial}>
      <LangProvider>
        <ResidentShell>{children}</ResidentShell>
      </LangProvider>
    </LiveProvider>
  );
}
