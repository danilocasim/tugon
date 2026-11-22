import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/tugon/service-worker";
import { TanodLangProvider } from "@/features/tanod/lang";
import { TanodShell } from "@/features/tanod/shell";
import { LiveProvider } from "@/hooks/use-live";

export const metadata: Metadata = {
  title: { default: "Tugon Tanod", template: "%s · Tugon Tanod" },
  manifest: "/tanod.webmanifest",
  appleWebApp: { capable: true, title: "Tanod", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f2f1ed" };

export default function TanodLayout({ children }: LayoutProps<"/tanod">) {
  return (
    <LiveProvider portal="tanod">
      <TanodLangProvider>
        <TanodShell>{children}</TanodShell>
        <ServiceWorker />
      </TanodLangProvider>
    </LiveProvider>
  );
}
