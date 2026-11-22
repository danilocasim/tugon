import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/barangay.webmanifest",
  title: { default: "Munti Report Staff", template: "%s · Munti Report Staff" },
  appleWebApp: { capable: true, title: "Munti Report Staff", statusBarStyle: "default" },
};

export default function StaffLayout({ children }: LayoutProps<"/barangay">) {
  return children;
}
