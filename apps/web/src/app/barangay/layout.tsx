import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/barangay.webmanifest",
  appleWebApp: { capable: true, title: "Tugon Staff", statusBarStyle: "default" },
};

export default function StaffLayout({ children }: LayoutProps<"/barangay">) {
  return children;
}
