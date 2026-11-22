import type { Metadata, Viewport } from "next";
import { TanodLangProvider } from "@/features/tanod/lang";

export const metadata: Metadata = {
  title: { default: "Munti Report Tanod", template: "%s · Munti Report Tanod" },
  manifest: "/tanod.webmanifest",
  appleWebApp: { capable: true, title: "Munti Tanod", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f2f1ed" };

export default function TanodLayout({ children }: LayoutProps<"/tanod">) {
  return <TanodLangProvider>{children}</TanodLangProvider>;
}
