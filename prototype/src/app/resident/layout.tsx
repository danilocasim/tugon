import type { Metadata, Viewport } from "next";
import { LiveProvider } from "@/hooks/use-live";
import { LangProvider } from "@/features/resident/lang";
import { ResidentShell } from "@/features/resident/shell";
import { ServiceWorker } from "@/components/tugon/service-worker";

export const metadata: Metadata = {
  title: { default: "Resident portal", template: "%s · Tugon" },
  manifest: "/resident.webmanifest",
  appleWebApp: { capable: true, title: "Tugon", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f2f1ed" };

export default function ResidentLayout({ children }: LayoutProps<"/resident">) {
  return (
    <LiveProvider portal="resident">
      <LangProvider>
        <ResidentShell>{children}</ResidentShell>
        <ServiceWorker />
      </LangProvider>
    </LiveProvider>
  );
}
