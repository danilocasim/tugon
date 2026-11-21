import type { Metadata, Viewport } from "next";
import { TanodLangProvider } from "@/features/tanod/lang";

export const metadata: Metadata = {
  title: { default: "Tugon Tanod", template: "%s · Tugon Tanod" },
  manifest: "/tanod.webmanifest",
  appleWebApp: { capable: true, title: "Tanod", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f2f1ed" };

export default function TanodLayout({ children }: LayoutProps<"/tanod">) {
  return <TanodLangProvider>{children}</TanodLangProvider>;
}
