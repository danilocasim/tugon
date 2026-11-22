import type { Metadata } from "next";
import { ServiceWorker } from "@/components/tugon/service-worker";
import { StaffShell } from "@/features/barangay/shell";
import { LiveProvider } from "@/hooks/use-live";

export const metadata: Metadata = {
  title: { default: "Barangay portal", template: "%s · Tugon Staff" },
  manifest: "/barangay.webmanifest",
  appleWebApp: { capable: true, title: "Tugon Staff", statusBarStyle: "default" },
};

export default function BarangayLayout({ children }: LayoutProps<"/barangay">) {
  return (
    <LiveProvider portal="staff">
      <StaffShell>{children}</StaffShell>
      <ServiceWorker />
    </LiveProvider>
  );
}
