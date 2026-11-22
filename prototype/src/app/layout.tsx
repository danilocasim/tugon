import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Chosen for legibility across ages and screen quality, not trend.
const sans = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ["latin"], variable: "--font-atkinson-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tugon · Barangay service requests", template: "%s · Tugon" },
  description: "Prototype: resident reporting and barangay case management for Barangay Sampaguita (fictional).",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#f2f1ed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
